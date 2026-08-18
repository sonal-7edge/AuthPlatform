/* ------------------------------------------------------------------
   Maps config/endpoints.json to a CloudFormation template covering the
   whole request path for every endpoint:

     AWS::ApiGateway::RestApi         one REGIONAL API
     AWS::ApiGateway::Resource        one per path segment (deduped)
     AWS::ApiGateway::Method          one per endpoint + an OPTIONS/CORS
                                      preflight per resource
     AWS::ApiGateway::Authorizer      Cognito user pool / Lambda TOKEN
     AWS::Lambda::Function            one per endpoint, code pulled from S3
     AWS::Logs::LogGroup              one per function (+ API access logs)
     AWS::Lambda::Permission          apigateway invoke, scoped per route
     AWS::ApiGateway::Deployment      logical id hashed over the routes so
                                      a route change forces a redeploy
     AWS::ApiGateway::Stage           access logs, throttling, metrics

   The Lambda code itself is not inlined — deploy.sh zips the service,
   uploads it to S3 and passes the bucket/key in as parameters.
------------------------------------------------------------------ */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { toYaml } = require('./yaml')

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'endpoints.json')
const TEMPLATE_PATH = path.join(__dirname, 'auth_cloudformation.yml')

const AUTHORIZERS = ['none', 'cognito', 'lambda', 'iam']
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

/* ---------------------------- helpers ---------------------------- */

function pascal(str, fallback) {
    const cleaned = String(str || '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
    return cleaned || fallback
}

// Drop undefined / empty values so the template stays clean.
function prune(obj) {
    if (Array.isArray(obj)) return obj.map(prune).filter((v) => v !== undefined)
    if (obj && typeof obj === 'object') {
        const out = {}
        for (const [k, v] of Object.entries(obj)) {
            const pv = prune(v)
            if (pv === undefined) continue
            if (Array.isArray(pv) && pv.length === 0) continue
            if (pv && typeof pv === 'object' && !Array.isArray(pv) && Object.keys(pv).length === 0) continue
            out[k] = pv
        }
        return out
    }
    if (obj === '' || obj === null) return undefined
    return obj
}

const sub = (str) => ({ 'Fn::Sub': str })
const ref = (name) => ({ Ref: name })
const getAtt = (res, attr) => ({ 'Fn::GetAtt': [res, attr] })
const fnIf = (cond, whenTrue, whenFalse) => ({ 'Fn::If': [cond, whenTrue, whenFalse] })
const NO_VALUE = { Ref: 'AWS::NoValue' }

function tagList(extra = {}) {
    return [
        { Key: 'Project', Value: ref('ProjectName') },
        { Key: 'Environment', Value: ref('Environment') },
        { Key: 'ManagedBy', Value: 'cloudformation' },
        ...Object.entries(extra).map(([Key, Value]) => ({ Key, Value })),
    ]
}

function splitPath(p) {
    return String(p || '')
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean)
}

// '/auth/verify-otp' -> 'ApiResourceAuthVerifyOtp'; '{userId}' -> 'ParamUserId'
function resourceLogicalId(parts) {
    const suffix = parts
        .map((part) => (part.startsWith('{') ? `Param${pascal(part, 'P')}` : pascal(part, 'P')))
        .join('')
    return `ApiResource${suffix}`
}

/* ------------------------- config loading ------------------------ */

function loadConfig(configPath = CONFIG_PATH) {
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
}

/* ---------------------------- headers ---------------------------- */

/* A header list is a mixed array of:
     "@client"                     a named preset from config.headerPresets
     "client"                      same, when the bare token matches a preset
     "X-Client-Id"                 a header — required unless told otherwise
     "X-Device-Id:optional"        an explicitly optional header
     { name, required }            the long form, still accepted

   Listing a header on a route almost always means "reject the request
   without it", so bare names default to required; say :optional to opt out. */
function parseHeaderSpec(spec, where) {
    if (spec && typeof spec === 'object') {
        const name = String(spec.name || '').trim()
        if (!name) throw new Error(`${where}: a header entry is missing "name".`)
        return { name, required: spec.required !== false }
    }

    const text = String(spec).trim()
    const colon = text.indexOf(':')
    const name = (colon === -1 ? text : text.slice(0, colon)).trim()
    const mode = (colon === -1 ? 'required' : text.slice(colon + 1)).trim().toLowerCase()

    if (!/^[A-Za-z0-9-]+$/.test(name)) {
        throw new Error(`${where}: "${name}" is not a valid header name (letters, digits, hyphens).`)
    }
    if (!['required', 'optional'].includes(mode)) {
        throw new Error(`${where}: header "${name}" has qualifier ":${mode}"; use :required or :optional.`)
    }
    return { name, required: mode === 'required' }
}

function validatePresets(presets) {
    for (const [key, value] of Object.entries(presets)) {
        if (!/^[a-z][a-z0-9-]*$/.test(key)) {
            throw new Error(`Header preset "${key}" must be lower-case kebab-case.`)
        }
        if (!Array.isArray(value)) {
            throw new Error(`Header preset "${key}" must be an array of header specs.`)
        }
        // Presets are flat by design — no preset may reference another, so
        // there is no cycle to detect and expansion is a single pass.
        for (const entry of value) {
            const text = typeof entry === 'string' ? entry.trim() : ''
            if (text.startsWith('@')) {
                throw new Error(`Header preset "${key}" references preset "${text}"; presets cannot nest.`)
            }
            parseHeaderSpec(entry, `preset "${key}"`)
        }
    }
}

/* Expands presets and specs into a flat [{ name, required, source }] list.
   Later entries win over earlier ones for the same header name. */
function expandHeaders(specs, presets, where, source = 'explicit') {
    const out = []
    for (const spec of [].concat(specs || [])) {
        const text = typeof spec === 'string' ? spec.trim() : ''
        const bare = text.startsWith('@') ? text.slice(1) : text
        const isPreset = text.startsWith('@') || Object.hasOwn(presets, bare)

        if (isPreset) {
            if (!Object.hasOwn(presets, bare)) {
                const known = Object.keys(presets).join(', ') || '(none defined)'
                throw new Error(`${where}: unknown header preset "@${bare}". Known presets: ${known}.`)
            }
            for (const entry of presets[bare]) {
                out.push({ ...parseHeaderSpec(entry, where), source: `@${bare}` })
            }
        } else {
            out.push({ ...parseHeaderSpec(spec, where), source })
        }
    }
    return out
}

function mergeHeaders(...lists) {
    const byName = new Map()
    for (const list of lists) {
        for (const h of list) byName.set(h.name.toLowerCase(), { ...h })
    }
    return [...byName.values()]
}

/* Resolves defaults, validates, and sorts endpoints into a stable order
   so the generated template does not churn between runs. */
function resolveEndpoints(config) {
    const defaults = config.defaults || {}
    const presets = config.headerPresets || {}
    validatePresets(presets)
    const seenNames = new Set()
    const seenRoutes = new Set()

    const endpoints = (config.endpoints || []).map((raw) => {
        const name = String(raw.name || '').trim()
        if (!name) throw new Error('Every endpoint needs a "name".')
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
            throw new Error(`Endpoint name "${name}" must be lower-case kebab-case.`)
        }
        if (seenNames.has(name)) throw new Error(`Duplicate endpoint name "${name}".`)
        seenNames.add(name)

        const parts = splitPath(raw.path)
        if (parts.length === 0) throw new Error(`Endpoint "${name}" needs a "path".`)

        const method = String(raw.method || defaults.method || 'POST').toUpperCase()
        if (!HTTP_METHODS.includes(method)) {
            throw new Error(`Endpoint "${name}" has unsupported method "${method}".`)
        }

        const route = `${method} /${parts.join('/')}`
        if (seenRoutes.has(route)) throw new Error(`Duplicate route "${route}".`)
        seenRoutes.add(route)

        const authorizer = String(raw.authorizer || defaults.authorizer || 'none').toLowerCase()
        if (!AUTHORIZERS.includes(authorizer)) {
            throw new Error(
                `Endpoint "${name}" has unknown authorizer "${authorizer}" `
                + `(expected one of: ${AUTHORIZERS.join(', ')}).`,
            )
        }

        // Every route starts from defaults.headers; opt out per route with
        // "useDefaultHeaders": false when a route genuinely takes none.
        const where = `endpoint "${name}"`
        const inherited = raw.useDefaultHeaders === false
            ? []
            : expandHeaders(defaults.headers || [], presets, 'defaults.headers', 'default')
        const headers = mergeHeaders(inherited, expandHeaders(raw.headers, presets, where))

        // A Cognito / Lambda TOKEN authorizer reads the Authorization header,
        // so make sure it is declared on the method even if it was not listed.
        if ((authorizer === 'cognito' || authorizer === 'lambda')
            && !headers.some((h) => h.name.toLowerCase() === 'authorization')) {
            headers.push({ name: 'Authorization', required: true, source: `${authorizer} authorizer` })
        }

        return {
            name,
            path: `/${parts.join('/')}`,
            parts,
            method,
            authorizer,
            scopes: raw.scopes || [],
            description: raw.description || `${method} /${parts.join('/')}`,
            handler: raw.handler || `handlers/${name}.handler`,
            memorySize: raw.memorySize || defaults.memorySize || 256,
            timeout: raw.timeout || defaults.timeout || 15,
            apiKeyRequired: raw.apiKeyRequired ?? defaults.apiKeyRequired ?? false,
            cors: raw.cors ?? defaults.cors ?? true,
            headers,
            logical: pascal(name, 'Endpoint'),
        }
    })

    endpoints.sort((a, b) => (a.path === b.path
        ? a.method.localeCompare(b.method)
        : a.path.localeCompare(b.path)))

    return endpoints
}

/* --------------------------- parameters -------------------------- */

function buildParameters(config, endpoints) {
    const cors = config.api?.cors || {}
    const params = {
        ProjectName: {
            Type: 'String',
            Default: 'authplatform',
            AllowedPattern: '^[a-z][a-z0-9-]{1,28}[a-z0-9]$',
            Description: 'Prefix for every resource name created by this stack.',
        },
        Environment: {
            Type: 'String',
            Default: 'dev',
            AllowedValues: ['dev', 'staging', 'prod'],
            Description: 'Deployment environment.',
        },
        ArtifactBucket: {
            Type: 'String',
            Description: 'S3 bucket holding the Lambda deployment package (created/uploaded by deploy.sh).',
        },
        ArtifactKey: {
            Type: 'String',
            Description: 'S3 key of the Lambda deployment package, e.g. auth/dev/<sha>.zip.',
        },
        CognitoUserPoolId: {
            Type: 'String',
            Description: 'Cognito user pool the handlers talk to.',
        },
        CognitoUserPoolClientId: {
            Type: 'String',
            Description: 'Cognito app client id used by the handlers.',
        },
        CognitoClientSecretArn: {
            Type: 'String',
            Default: '',
            Description: 'Optional Secrets Manager ARN holding the app client secret. Empty to disable.',
        },
        ApiStageName: {
            Type: 'String',
            Default: 'v1',
            AllowedPattern: '^[a-zA-Z0-9_-]+$',
            Description: 'API Gateway stage name; becomes the first path segment of the invoke URL.',
        },
        CorsAllowOrigin: {
            Type: 'String',
            Default: cors.allowOrigin || '*',
            Description: 'Value returned in Access-Control-Allow-Origin.',
        },
        LogRetentionInDays: {
            Type: 'Number',
            Default: 30,
            AllowedValues: [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 3653],
            Description: 'Retention applied to every log group this stack creates.',
        },
        LogLevel: {
            Type: 'String',
            Default: 'info',
            AllowedValues: ['debug', 'info', 'warn', 'error'],
            Description: 'LOG_LEVEL environment variable passed to every function.',
        },
        ThrottlingRateLimit: {
            Type: 'Number',
            Default: 50,
            Description: 'Steady-state requests per second per method.',
        },
        ThrottlingBurstLimit: {
            Type: 'Number',
            Default: 100,
            Description: 'Burst capacity per method.',
        },
        EnableXRayTracing: {
            Type: 'String',
            Default: 'true',
            AllowedValues: ['true', 'false'],
            Description: 'Turn on X-Ray active tracing for the API stage and every function.',
        },
        ManageApiGatewayAccount: {
            Type: 'String',
            Default: 'false',
            AllowedValues: ['true', 'false'],
            Description:
                'Set to true once per account/region to let this stack own the API Gateway '
                + 'CloudWatch Logs role. Leave false if another stack already set it.',
        },
    }

    if (endpoints.some((e) => e.authorizer === 'cognito')) {
        params.CognitoUserPoolArn = {
            Type: 'String',
            AllowedPattern: '^arn:aws[a-zA-Z-]*:cognito-idp:.+$',
            Description: 'ARN of the user pool backing the COGNITO_USER_POOLS authorizer.',
        }
    }
    if (endpoints.some((e) => e.authorizer === 'lambda')) {
        params.AuthorizerFunctionArn = {
            Type: 'String',
            AllowedPattern: '^arn:aws[a-zA-Z-]*:lambda:.+$',
            Description: 'ARN of the Lambda function backing the TOKEN authorizer.',
        }
    }

    return params
}

/* ---------------------------- resources -------------------------- */

function buildExecutionRole(endpoints) {
    const cognitoActions = [
        'cognito-idp:SignUp',
        'cognito-idp:ConfirmSignUp',
        'cognito-idp:ResendConfirmationCode',
        'cognito-idp:InitiateAuth',
        'cognito-idp:RespondToAuthChallenge',
        'cognito-idp:ForgotPassword',
        'cognito-idp:ConfirmForgotPassword',
        'cognito-idp:ChangePassword',
        'cognito-idp:GetUser',
        'cognito-idp:DeleteUser',
        'cognito-idp:GlobalSignOut',
        'cognito-idp:RevokeToken',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminInitiateAuth',
        'cognito-idp:AdminRespondToAuthChallenge',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminUserGlobalSignOut',
    ]

    const statements = [
        {
            Sid: 'WriteFunctionLogs',
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: [
                sub('arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}'
                    + ':log-group:/aws/lambda/${ProjectName}-${Environment}-*:*'),
            ],
        },
        {
            Sid: 'CognitoUserPoolAccess',
            Effect: 'Allow',
            Action: cognitoActions,
            Resource: [
                sub('arn:${AWS::Partition}:cognito-idp:${AWS::Region}:${AWS::AccountId}'
                    + ':userpool/${CognitoUserPoolId}'),
            ],
        },
        fnIf(
            'HasClientSecret',
            {
                Sid: 'ReadAppClientSecret',
                Effect: 'Allow',
                Action: ['secretsmanager:GetSecretValue'],
                Resource: [ref('CognitoClientSecretArn')],
            },
            NO_VALUE,
        ),
        fnIf(
            'XRayEnabled',
            {
                Sid: 'XRayTracing',
                Effect: 'Allow',
                Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
                Resource: ['*'],
            },
            NO_VALUE,
        ),
    ]

    return {
        Type: 'AWS::IAM::Role',
        Properties: {
            RoleName: sub('${ProjectName}-${Environment}-auth-lambda-role'),
            Description: `Execution role shared by the ${endpoints.length} auth functions.`,
            AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: { Service: 'lambda.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                }],
            },
            Policies: [{
                PolicyName: 'auth-service-access',
                PolicyDocument: { Version: '2012-10-17', Statement: statements },
            }],
            Tags: tagList(),
        },
    }
}

function buildFunction(ep, api) {
    return {
        Type: 'AWS::Lambda::Function',
        // The log group must exist before the function runs, otherwise Lambda
        // creates it itself with never-expire retention.
        DependsOn: [`${ep.logical}LogGroup`],
        Properties: {
            FunctionName: sub(`\${ProjectName}-\${Environment}-${ep.name}`),
            Description: ep.description,
            Runtime: api.runtime || 'nodejs20.x',
            Architectures: [api.architecture || 'arm64'],
            Handler: ep.handler,
            Role: getAtt('LambdaExecutionRole', 'Arn'),
            MemorySize: ep.memorySize,
            Timeout: ep.timeout,
            Code: { S3Bucket: ref('ArtifactBucket'), S3Key: ref('ArtifactKey') },
            TracingConfig: fnIf('XRayEnabled', { Mode: 'Active' }, NO_VALUE),
            Environment: {
                Variables: {
                    NODE_OPTIONS: '--enable-source-maps',
                    PROJECT_NAME: ref('ProjectName'),
                    ENVIRONMENT: ref('Environment'),
                    LOG_LEVEL: ref('LogLevel'),
                    USER_POOL_ID: ref('CognitoUserPoolId'),
                    USER_POOL_CLIENT_ID: ref('CognitoUserPoolClientId'),
                    CLIENT_SECRET_ARN: ref('CognitoClientSecretArn'),
                    CORS_ALLOW_ORIGIN: ref('CorsAllowOrigin'),
                },
            },
            Tags: tagList({ Endpoint: ep.path }),
        },
    }
}

function buildLogGroup(ep) {
    return {
        Type: 'AWS::Logs::LogGroup',
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Delete',
        Properties: {
            LogGroupName: sub(`/aws/lambda/\${ProjectName}-\${Environment}-${ep.name}`),
            RetentionInDays: ref('LogRetentionInDays'),
            Tags: tagList({ Endpoint: ep.path }),
        },
    }
}

function buildPermission(ep) {
    return {
        Type: 'AWS::Lambda::Permission',
        Properties: {
            Action: 'lambda:InvokeFunction',
            FunctionName: getAtt(`${ep.logical}Function`, 'Arn'),
            Principal: 'apigateway.amazonaws.com',
            SourceArn: sub(
                'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}'
                + `:\${AuthRestApi}/*/${ep.method}${ep.path}`,
            ),
        },
    }
}

function buildMethod(ep, resourceId, needsValidator) {
    const requestParameters = {}
    for (const h of ep.headers) {
        requestParameters[`method.request.header.${h.name}`] = h.required === true
    }
    const hasRequiredHeader = ep.headers.some((h) => h.required === true)

    let authorizationType = 'NONE'
    let authorizerId
    if (ep.authorizer === 'cognito') {
        authorizationType = 'COGNITO_USER_POOLS'
        authorizerId = ref('CognitoAuthorizer')
    } else if (ep.authorizer === 'lambda') {
        authorizationType = 'CUSTOM'
        authorizerId = ref('LambdaTokenAuthorizer')
    } else if (ep.authorizer === 'iam') {
        authorizationType = 'AWS_IAM'
    }

    return {
        Type: 'AWS::ApiGateway::Method',
        Properties: prune({
            RestApiId: ref('AuthRestApi'),
            ResourceId: ref(resourceId),
            HttpMethod: ep.method,
            OperationName: ep.name,
            AuthorizationType: authorizationType,
            AuthorizerId: authorizerId,
            AuthorizationScopes: ep.authorizer === 'cognito' && ep.scopes.length ? ep.scopes : undefined,
            ApiKeyRequired: ep.apiKeyRequired,
            RequestParameters: requestParameters,
            RequestValidatorId: needsValidator && hasRequiredHeader ? ref('RequestParameterValidator') : undefined,
            Integration: {
                Type: 'AWS_PROXY',
                // AWS_PROXY always invokes Lambda over POST, whatever the route's method is.
                IntegrationHttpMethod: 'POST',
                Uri: sub(
                    'arn:${AWS::Partition}:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/'
                    + `\${${ep.logical}Function.Arn}/invocations`,
                ),
                TimeoutInMillis: Math.min(29000, ep.timeout * 1000 + 1000),
            },
        }),
    }
}

/* Preflight is answered by API Gateway itself (MOCK), so the browser never
   pays for a Lambda cold start on OPTIONS. */
function buildCorsMethod(resourceId, methods, allowHeaders, maxAge) {
    const allowMethods = [...new Set([...methods, 'OPTIONS'])].sort().join(',')
    const headerLine = allowHeaders.join(',')

    return {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
            RestApiId: ref('AuthRestApi'),
            ResourceId: ref(resourceId),
            HttpMethod: 'OPTIONS',
            AuthorizationType: 'NONE',
            ApiKeyRequired: false,
            Integration: {
                Type: 'MOCK',
                RequestTemplates: { 'application/json': '{"statusCode": 200}' },
                IntegrationResponses: [{
                    StatusCode: '204',
                    ResponseParameters: {
                        'method.response.header.Access-Control-Allow-Headers': `'${headerLine}'`,
                        'method.response.header.Access-Control-Allow-Methods': `'${allowMethods}'`,
                        'method.response.header.Access-Control-Allow-Origin': sub("'${CorsAllowOrigin}'"),
                        'method.response.header.Access-Control-Max-Age': `'${maxAge}'`,
                    },
                    ResponseTemplates: { 'application/json': '' },
                }],
            },
            MethodResponses: [{
                StatusCode: '204',
                ResponseParameters: {
                    'method.response.header.Access-Control-Allow-Headers': true,
                    'method.response.header.Access-Control-Allow-Methods': true,
                    'method.response.header.Access-Control-Allow-Origin': true,
                    'method.response.header.Access-Control-Max-Age': true,
                },
            }],
        },
    }
}

/* --------------------------- the template ------------------------ */

function generateTemplate(config) {
    const endpoints = resolveEndpoints(config)
    if (endpoints.length === 0) throw new Error('No endpoints defined in config/endpoints.json.')

    const api = config.api || {}
    const cors = api.cors || {}
    const allowHeaders = cors.allowHeaders && cors.allowHeaders.length
        ? cors.allowHeaders
        : ['Content-Type', 'Authorization']

    const usesCognito = endpoints.some((e) => e.authorizer === 'cognito')
    const usesLambdaAuth = endpoints.some((e) => e.authorizer === 'lambda')
    const needsValidator = endpoints.some((e) => e.headers.some((h) => h.required === true))

    const resources = {}
    const methodIds = []

    /* --- API + shared plumbing --- */

    resources.AuthRestApi = {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
            Name: sub(`\${ProjectName}-\${Environment}-${api.name || 'auth'}-api`),
            Description: api.description || 'Authentication API',
            EndpointConfiguration: { Types: ['REGIONAL'] },
            MinimumCompressionSize: 1024,
            Tags: tagList(),
        },
    }

    resources.LambdaExecutionRole = buildExecutionRole(endpoints)

    resources.ApiAccessLogGroup = {
        Type: 'AWS::Logs::LogGroup',
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Delete',
        Properties: {
            LogGroupName: sub(`/aws/apigateway/\${ProjectName}-\${Environment}-${api.name || 'auth'}`),
            RetentionInDays: ref('LogRetentionInDays'),
            Tags: tagList(),
        },
    }

    // API Gateway's CloudWatch role is an account-wide singleton; only take
    // ownership of it when explicitly asked to.
    resources.ApiGatewayCloudWatchRole = {
        Type: 'AWS::IAM::Role',
        Condition: 'ManageApiGatewayAccountSetting',
        Properties: {
            RoleName: sub('${ProjectName}-${Environment}-apigw-logs-role'),
            AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: { Service: 'apigateway.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                }],
            },
            ManagedPolicyArns: [
                sub('arn:${AWS::Partition}:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
            ],
            Tags: tagList(),
        },
    }

    resources.ApiGatewayAccount = {
        Type: 'AWS::ApiGateway::Account',
        Condition: 'ManageApiGatewayAccountSetting',
        DependsOn: ['ApiGatewayCloudWatchRole'],
        Properties: { CloudWatchRoleArn: getAtt('ApiGatewayCloudWatchRole', 'Arn') },
    }

    if (needsValidator) {
        resources.RequestParameterValidator = {
            Type: 'AWS::ApiGateway::RequestValidator',
            Properties: {
                Name: sub('${ProjectName}-${Environment}-params'),
                RestApiId: ref('AuthRestApi'),
                ValidateRequestParameters: true,
                ValidateRequestBody: false,
            },
        }
    }

    if (usesCognito) {
        resources.CognitoAuthorizer = {
            Type: 'AWS::ApiGateway::Authorizer',
            Properties: {
                Name: sub('${ProjectName}-${Environment}-cognito-authorizer'),
                RestApiId: ref('AuthRestApi'),
                Type: 'COGNITO_USER_POOLS',
                IdentitySource: 'method.request.header.Authorization',
                ProviderARNs: [ref('CognitoUserPoolArn')],
            },
        }
    }

    if (usesLambdaAuth) {
        resources.LambdaTokenAuthorizer = {
            Type: 'AWS::ApiGateway::Authorizer',
            Properties: {
                Name: sub('${ProjectName}-${Environment}-token-authorizer'),
                RestApiId: ref('AuthRestApi'),
                Type: 'TOKEN',
                IdentitySource: 'method.request.header.Authorization',
                AuthorizerResultTtlInSeconds: 300,
                AuthorizerUri: sub(
                    'arn:${AWS::Partition}:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/'
                    + '${AuthorizerFunctionArn}/invocations',
                ),
            },
        }
        resources.LambdaTokenAuthorizerPermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
                Action: 'lambda:InvokeFunction',
                FunctionName: ref('AuthorizerFunctionArn'),
                Principal: 'apigateway.amazonaws.com',
                SourceArn: sub(
                    'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}'
                    + ':${AuthRestApi}/authorizers/${LambdaTokenAuthorizer}',
                ),
            },
        }
    }

    // Without these, a 401/403/429 raised by API Gateway itself reaches the
    // browser with no CORS headers and shows up as an opaque network error.
    for (const [logical, type] of [['Default4XX', 'DEFAULT_4XX'], ['Default5XX', 'DEFAULT_5XX']]) {
        resources[`GatewayResponse${logical}`] = {
            Type: 'AWS::ApiGateway::GatewayResponse',
            Properties: {
                RestApiId: ref('AuthRestApi'),
                ResponseType: type,
                ResponseParameters: {
                    'gatewayresponse.header.Access-Control-Allow-Origin': sub("'${CorsAllowOrigin}'"),
                    'gatewayresponse.header.Access-Control-Allow-Headers': `'${allowHeaders.join(',')}'`,
                },
            },
        }
    }

    /* --- path tree --- */

    const resourceIdByPath = new Map()
    const methodsByResource = new Map()
    const corsByResource = new Map()

    for (const ep of endpoints) {
        let parentRef = getAtt('AuthRestApi', 'RootResourceId')
        const walked = []
        for (const part of ep.parts) {
            walked.push(part)
            const key = walked.join('/')
            let logical = resourceIdByPath.get(key)
            if (!logical) {
                logical = resourceLogicalId(walked)
                if (resources[logical]) throw new Error(`Logical id collision on "${logical}".`)
                resources[logical] = {
                    Type: 'AWS::ApiGateway::Resource',
                    Properties: {
                        RestApiId: ref('AuthRestApi'),
                        ParentId: parentRef,
                        PathPart: part,
                    },
                }
                resourceIdByPath.set(key, logical)
            }
            parentRef = ref(logical)
        }

        const leaf = resourceIdByPath.get(ep.parts.join('/'))
        methodsByResource.set(leaf, [...(methodsByResource.get(leaf) || []), ep.method])
        if (ep.cors) corsByResource.set(leaf, true)

        resources[`${ep.logical}LogGroup`] = buildLogGroup(ep)
        resources[`${ep.logical}Function`] = buildFunction(ep, api)
        resources[`${ep.logical}InvokePermission`] = buildPermission(ep)

        const methodId = `${ep.logical}Method`
        resources[methodId] = buildMethod(ep, leaf, needsValidator)
        methodIds.push(methodId)
    }

    for (const [resourceId] of corsByResource) {
        const logical = `${resourceId.replace(/^ApiResource/, '')}CorsMethod`
        resources[logical] = buildCorsMethod(
            resourceId,
            methodsByResource.get(resourceId) || [],
            allowHeaders,
            cors.maxAge || 600,
        )
        methodIds.push(logical)
    }

    /* --- deployment + stage --- */

    // Hashing the routes into the logical id means every route change creates
    // a brand new Deployment, which is what actually publishes the change.
    // Only what API Gateway actually serves — "source" is provenance for the
    // CLI's benefit and must not churn the deployment id.
    const routeFingerprint = JSON.stringify(endpoints.map((e) => [
        e.method, e.path, e.authorizer, e.scopes, e.handler, e.cors,
        e.headers.map((h) => [h.name, h.required]),
    ]))
    const hash = crypto.createHash('sha256').update(routeFingerprint).digest('hex').slice(0, 12)
    const deploymentId = `ApiDeployment${hash}`

    resources[deploymentId] = {
        Type: 'AWS::ApiGateway::Deployment',
        DependsOn: methodIds.slice().sort(),
        Properties: {
            RestApiId: ref('AuthRestApi'),
            Description: sub(`Routes fingerprint ${hash} — \${Environment}`),
        },
    }

    resources.ApiStage = {
        Type: 'AWS::ApiGateway::Stage',
        Properties: {
            RestApiId: ref('AuthRestApi'),
            DeploymentId: ref(deploymentId),
            StageName: ref('ApiStageName'),
            Description: sub('${Environment} stage'),
            TracingEnabled: fnIf('XRayEnabled', true, false),
            AccessLogSetting: {
                DestinationArn: getAtt('ApiAccessLogGroup', 'Arn'),
                Format: JSON.stringify({
                    requestId: '$context.requestId',
                    ip: '$context.identity.sourceIp',
                    requestTime: '$context.requestTime',
                    httpMethod: '$context.httpMethod',
                    resourcePath: '$context.resourcePath',
                    status: '$context.status',
                    protocol: '$context.protocol',
                    responseLength: '$context.responseLength',
                    integrationLatency: '$context.integrationLatency',
                    responseLatency: '$context.responseLatency',
                    userAgent: '$context.identity.userAgent',
                    errorMessage: '$context.error.message',
                }),
            },
            MethodSettings: [{
                ResourcePath: '/*',
                HttpMethod: '*',
                LoggingLevel: 'INFO',
                DataTraceEnabled: false,
                MetricsEnabled: true,
                ThrottlingRateLimit: ref('ThrottlingRateLimit'),
                ThrottlingBurstLimit: ref('ThrottlingBurstLimit'),
            }],
            Tags: tagList(),
        },
    }

    /* --- outputs --- */

    const outputs = {
        ApiInvokeUrl: {
            Description: 'Base URL for the auth API — set this as VITE_API_BASE_URL.',
            Value: sub('https://${AuthRestApi}.execute-api.${AWS::Region}.${AWS::URLSuffix}/${ApiStageName}'),
            Export: { Name: sub('${ProjectName}-${Environment}-auth-api-url') },
        },
        RestApiId: {
            Description: 'API Gateway REST API id.',
            Value: ref('AuthRestApi'),
            Export: { Name: sub('${ProjectName}-${Environment}-auth-api-id') },
        },
        StageName: { Description: 'Deployed stage name.', Value: ref('ApiStageName') },
        LambdaExecutionRoleArn: {
            Description: 'Execution role shared by the auth functions.',
            Value: getAtt('LambdaExecutionRole', 'Arn'),
            Export: { Name: sub('${ProjectName}-${Environment}-auth-lambda-role-arn') },
        },
        ApiAccessLogGroupName: {
            Description: 'CloudWatch log group receiving API Gateway access logs.',
            Value: ref('ApiAccessLogGroup'),
        },
        DeployedArtifact: {
            Description: 'S3 location of the deployed Lambda package.',
            Value: sub('s3://${ArtifactBucket}/${ArtifactKey}'),
        },
        EndpointCount: { Description: 'Number of routes in this stack.', Value: String(endpoints.length) },
    }

    const generatedFrom = endpoints.map((e) => `${e.method} ${e.path} (${e.authorizer})`).join(', ')

    return {
        AWSTemplateFormatVersion: '2010-09-09',
        Description:
            `AuthPlatform ${api.name || 'auth'} API — ${endpoints.length} endpoints, one Lambda + log group each. `
            + 'Generated from config/endpoints.json by cli/endpoint.js; do not edit by hand.',
        Metadata: {
            'AWS::CloudFormation::Interface': {
                ParameterGroups: [
                    {
                        Label: { default: 'Naming' },
                        Parameters: ['ProjectName', 'Environment', 'ApiStageName'],
                    },
                    {
                        Label: { default: 'Lambda artifact' },
                        Parameters: ['ArtifactBucket', 'ArtifactKey'],
                    },
                    {
                        Label: { default: 'Cognito' },
                        Parameters: [
                            'CognitoUserPoolId',
                            'CognitoUserPoolClientId',
                            usesCognito ? 'CognitoUserPoolArn' : undefined,
                            'CognitoClientSecretArn',
                        ].filter(Boolean),
                    },
                    {
                        Label: { default: 'Observability & limits' },
                        Parameters: [
                            'LogRetentionInDays',
                            'LogLevel',
                            'ThrottlingRateLimit',
                            'ThrottlingBurstLimit',
                            'EnableXRayTracing',
                            'ManageApiGatewayAccount',
                        ],
                    },
                ],
            },
            Routes: generatedFrom,
        },
        Parameters: buildParameters(config, endpoints),
        Conditions: {
            HasClientSecret: { 'Fn::Not': [{ 'Fn::Equals': [ref('CognitoClientSecretArn'), ''] }] },
            XRayEnabled: { 'Fn::Equals': [ref('EnableXRayTracing'), 'true'] },
            ManageApiGatewayAccountSetting: { 'Fn::Equals': [ref('ManageApiGatewayAccount'), 'true'] },
        },
        Resources: resources,
        Outputs: outputs,
    }
}

function buildTemplateObject(config = loadConfig()) {
    return generateTemplate(config)
}

function templateAsYaml(config = loadConfig()) {
    return toYaml(buildTemplateObject(config))
}

function writeTemplate(config = loadConfig(), outPath = TEMPLATE_PATH) {
    const banner = [
        '# ---------------------------------------------------------------------------',
        '# GENERATED FILE — do not edit by hand.',
        '#',
        '# Source of truth : backend-code/auth/config/endpoints.json',
        '# Regenerate with : node cli/endpoint.js generate',
        '# ---------------------------------------------------------------------------',
        '',
    ].join('\n')
    const yaml = banner + templateAsYaml(config)
    fs.writeFileSync(outPath, yaml, 'utf8')
    return outPath
}

module.exports = {
    CONFIG_PATH,
    TEMPLATE_PATH,
    AUTHORIZERS,
    HTTP_METHODS,
    loadConfig,
    resolveEndpoints,
    buildTemplateObject,
    templateAsYaml,
    writeTemplate,
}
