#!/usr/bin/env bash
#
# Package the auth service, upload it to S3 and deploy the CloudFormation
# stack that wires it up (Lambda + log groups + API Gateway).
#
#   ./deploy.sh --env dev --region ap-south-1 \
#       --user-pool-id ap-south-1_AbCdEf123 --client-id 1h57kf5cpq17m0eml12EXAMPLE
#
# Settings can also live in config/.env.<env> (gitignored) so the flags stay
# short; anything passed on the command line wins.
#
# Run with --help for the full flag list.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TEMPLATE="${SCRIPT_DIR}/resources/auth_cloudformation.yml"
readonly BUILD_DIR="${SCRIPT_DIR}/build"

# Everything under these paths goes into the deployment package.
readonly PACKAGE_PATHS=(handlers lib utils)

# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
    C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
else
    C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''
fi

step() { printf '%s==>%s %s\n' "${C_BOLD}" "${C_RESET}" "$*"; }
info() { printf '    %s\n' "$*"; }
dim()  { printf '    %s%s%s\n' "${C_DIM}" "$*" "${C_RESET}"; }
warn() { printf '%s warn%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
ok()   { printf '%s  ok%s  %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
die()  { printf '%serror%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }

trap 'die "failed on line ${LINENO}"' ERR

cleanup() { [[ -n "${STAGE_DIR:-}" && -d "${STAGE_DIR}" ]] && rm -rf "${STAGE_DIR}"; }
trap cleanup EXIT

usage() {
    cat <<'EOF'

deploy.sh — build, upload and deploy the AuthPlatform auth API

USAGE
  ./deploy.sh --env <env> --region <region> [options]

REQUIRED (flag, config/.env.<env>, or environment variable)
  --env <env>               dev | staging | prod                  ENVIRONMENT
  --region <region>         AWS region                            AWS_REGION
  --user-pool-id <id>       Cognito user pool id                  USER_POOL_ID
  --client-id <id>          Cognito app client id                 USER_POOL_CLIENT_ID
  --user-pool-arn <arn>     Needed by the Cognito authorizer      USER_POOL_ARN
                            (derived from region + pool id if omitted)

OPTIONS
  --project <name>          Resource name prefix       (default authplatform)
  --stack <name>            Stack name                 (default <project>-<env>-auth)
  --bucket <name>           Artifact bucket            (default <project>-<env>-artifacts-<account>)
  --stage <name>            API Gateway stage          (default v1)
  --profile <name>          AWS CLI profile
  --cors-origin <origin>    Access-Control-Allow-Origin (default *)
  --log-retention <days>    CloudWatch retention        (default 30)
  --secret-arn <arn>        Secrets Manager ARN of the app client secret
  --skip-generate           Do not regenerate the template from endpoints.json
  --package-only            Build and upload the artifact, skip the stack deploy
  --dry-run                 Show what would happen; touch nothing in AWS
  -h, --help                This message

EOF
}

# ---------------------------------------------------------------------------
# arguments
# ---------------------------------------------------------------------------

# Internal names deliberately differ from the environment-variable names below
# (REGION vs AWS_REGION, POOL_ID vs USER_POOL_ID, …) so that sourcing an env
# file cannot silently overwrite a value that came from a flag.
ENV_NAME=''
REGION=''
PROJECT=''
STACK=''
BUCKET=''
STAGE_NAME=''
PROFILE=''
POOL_ID=''
CLIENT_ID=''
POOL_ARN=''
CORS_ORIGIN=''
LOG_RETENTION=''
SECRET_ARN=''
SKIP_GENERATE=false
PACKAGE_ONLY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env)            ENV_NAME="${2:?--env needs a value}"; shift 2 ;;
        --region)         REGION="${2:?--region needs a value}"; shift 2 ;;
        --project)        PROJECT="${2:?--project needs a value}"; shift 2 ;;
        --stack)          STACK="${2:?--stack needs a value}"; shift 2 ;;
        --bucket)         BUCKET="${2:?--bucket needs a value}"; shift 2 ;;
        --stage)          STAGE_NAME="${2:?--stage needs a value}"; shift 2 ;;
        --profile)        PROFILE="${2:?--profile needs a value}"; shift 2 ;;
        --user-pool-id)   POOL_ID="${2:?--user-pool-id needs a value}"; shift 2 ;;
        --client-id)      CLIENT_ID="${2:?--client-id needs a value}"; shift 2 ;;
        --user-pool-arn)  POOL_ARN="${2:?--user-pool-arn needs a value}"; shift 2 ;;
        --cors-origin)    CORS_ORIGIN="${2:?--cors-origin needs a value}"; shift 2 ;;
        --log-retention)  LOG_RETENTION="${2:?--log-retention needs a value}"; shift 2 ;;
        --secret-arn)     SECRET_ARN="${2:?--secret-arn needs a value}"; shift 2 ;;
        --skip-generate)  SKIP_GENERATE=true; shift ;;
        --package-only)   PACKAGE_ONLY=true; shift ;;
        --dry-run)        DRY_RUN=true; shift ;;
        -h|--help)        usage; exit 0 ;;
        *)                usage; die "unknown option \"$1\"" ;;
    esac
done

ENV_NAME="${ENV_NAME:-${ENVIRONMENT:-}}"
[[ -n "${ENV_NAME}" ]] || { usage; die "--env is required"; }
case "${ENV_NAME}" in
    dev|staging|prod) ;;
    *) die "--env must be dev, staging or prod (got \"${ENV_NAME}\")" ;;
esac

# Precedence: command-line flag > config/.env.<env> > ambient environment > default.
ENV_FILE="${SCRIPT_DIR}/config/.env.${ENV_NAME}"
if [[ -f "${ENV_FILE}" ]]; then
    step "Loading ${ENV_FILE#"${SCRIPT_DIR}/"}"
    # shellcheck disable=SC1090
    set -a; source "${ENV_FILE}"; set +a
fi

REGION="${REGION:-${AWS_REGION:-}}"
PROJECT="${PROJECT:-${PROJECT_NAME:-authplatform}}"
STACK="${STACK:-${STACK_NAME:-}}"
BUCKET="${BUCKET:-${ARTIFACT_BUCKET:-}}"
STAGE_NAME="${STAGE_NAME:-${API_STAGE_NAME:-v1}}"
PROFILE="${PROFILE:-${AWS_PROFILE:-}}"
POOL_ID="${POOL_ID:-${USER_POOL_ID:-}}"
CLIENT_ID="${CLIENT_ID:-${USER_POOL_CLIENT_ID:-}}"
POOL_ARN="${POOL_ARN:-${USER_POOL_ARN:-}}"
CORS_ORIGIN="${CORS_ORIGIN:-${CORS_ALLOW_ORIGIN:-*}}"
LOG_RETENTION="${LOG_RETENTION:-${LOG_RETENTION_DAYS:-30}}"
SECRET_ARN="${SECRET_ARN:-${CLIENT_SECRET_ARN:-}}"

[[ -n "${REGION}" ]]    || die "--region is required (or set AWS_REGION)"
[[ -n "${POOL_ID}" ]]   || die "--user-pool-id is required"
[[ -n "${CLIENT_ID}" ]] || die "--client-id is required"

STACK="${STACK:-${PROJECT}-${ENV_NAME}-auth}"

AWS_ARGS=(--region "${REGION}")
[[ -n "${PROFILE}" ]] && AWS_ARGS+=(--profile "${PROFILE}")

# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------

step "Preflight"
for tool in aws node zip; do
    command -v "${tool}" >/dev/null 2>&1 || die "\"${tool}\" is not on PATH"
done
dim "aws  $(aws --version 2>&1 | head -1)"
dim "node $(node --version)"

ACCOUNT_ID="$(aws "${AWS_ARGS[@]}" sts get-caller-identity --query Account --output text)" \
    || die "could not reach AWS — check your credentials/profile"
CALLER="$(aws "${AWS_ARGS[@]}" sts get-caller-identity --query Arn --output text)"
dim "account ${ACCOUNT_ID} · ${CALLER}"

BUCKET="${BUCKET:-${PROJECT}-${ENV_NAME}-artifacts-${ACCOUNT_ID}}"

# The Cognito authorizer needs the pool ARN; it is derivable from the pool id.
PARTITION="$(aws "${AWS_ARGS[@]}" sts get-caller-identity --query Arn --output text | cut -d: -f2)"
POOL_ARN="${POOL_ARN:-arn:${PARTITION}:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/${POOL_ID}}"

ok "targeting ${C_BOLD}${STACK}${C_RESET} in ${REGION}"

# ---------------------------------------------------------------------------
# 1. regenerate + validate the template
# ---------------------------------------------------------------------------

if [[ "${SKIP_GENERATE}" == false ]]; then
    step "Generating template from config/endpoints.json"
    node "${SCRIPT_DIR}/cli/endpoint.js" generate
else
    dim "skipping template generation (--skip-generate)"
fi

[[ -f "${TEMPLATE}" ]] || die "template not found at ${TEMPLATE}"

step "Validating template"
aws "${AWS_ARGS[@]}" cloudformation validate-template \
    --template-body "file://${TEMPLATE}" >/dev/null \
    || die "CloudFormation rejected the template"
ok "template is valid"

# ---------------------------------------------------------------------------
# 2. build a deterministic deployment package
# ---------------------------------------------------------------------------

step "Packaging"
mkdir -p "${BUILD_DIR}"
STAGE_DIR="$(mktemp -d "${BUILD_DIR}/stage.XXXXXX")"

for entry in "${PACKAGE_PATHS[@]}"; do
    if [[ -d "${SCRIPT_DIR}/${entry}" ]]; then
        cp -R "${SCRIPT_DIR}/${entry}" "${STAGE_DIR}/"
    fi
done

# Production dependencies, when the service has any of its own. The Node 20
# runtime already ships the AWS SDK v3, so this is usually a no-op.
if [[ -f "${SCRIPT_DIR}/package.json" ]]; then
    cp "${SCRIPT_DIR}/package.json" "${STAGE_DIR}/"
    [[ -f "${SCRIPT_DIR}/package-lock.json" ]] && cp "${SCRIPT_DIR}/package-lock.json" "${STAGE_DIR}/"
    if [[ -f "${STAGE_DIR}/package-lock.json" ]]; then
        (cd "${STAGE_DIR}" && npm ci --omit=dev --silent)
    else
        (cd "${STAGE_DIR}" && npm install --omit=dev --silent)
    fi
fi

find "${STAGE_DIR}" -name '*.test.js' -delete
find "${STAGE_DIR}" -name '.DS_Store' -delete

# Same source must produce the same zip, otherwise every deploy looks like a
# code change and replaces all twelve functions for nothing.
find "${STAGE_DIR}" -exec touch -t 200001010000 {} +
ZIP_PATH="${BUILD_DIR}/auth-${ENV_NAME}.zip"
rm -f "${ZIP_PATH}"
(cd "${STAGE_DIR}" && find . -type f | LC_ALL=C sort | zip -q -X -@ "${ZIP_PATH}")

SHA="$(sha256sum "${ZIP_PATH}" | cut -c1-12)"
ARTIFACT_KEY="auth/${ENV_NAME}/auth-${SHA}.zip"
ZIP_SIZE="$(du -h "${ZIP_PATH}" | cut -f1)"
FILE_COUNT="$(unzip -l "${ZIP_PATH}" | tail -1 | awk '{print $2}')"
ok "${ZIP_PATH#"${SCRIPT_DIR}/"} · ${ZIP_SIZE} · ${FILE_COUNT} files · sha ${SHA}"

if [[ "${DRY_RUN}" == true ]]; then
    step "Dry run — nothing was uploaded or deployed"
    info "bucket          s3://${BUCKET}"
    info "artifact key    ${ARTIFACT_KEY}"
    info "stack           ${STACK}"
    info "stage           ${STAGE_NAME}"
    info "user pool       ${POOL_ID}"
    info "user pool arn   ${POOL_ARN}"
    exit 0
fi

# ---------------------------------------------------------------------------
# 3. make sure the artifact bucket exists, then upload
# ---------------------------------------------------------------------------

step "Artifact bucket s3://${BUCKET}"
if aws "${AWS_ARGS[@]}" s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
    dim "already exists"
else
    info "creating…"
    # us-east-1 is the one region that rejects a LocationConstraint.
    if [[ "${REGION}" == "us-east-1" ]]; then
        aws "${AWS_ARGS[@]}" s3api create-bucket --bucket "${BUCKET}"
    else
        aws "${AWS_ARGS[@]}" s3api create-bucket --bucket "${BUCKET}" \
            --create-bucket-configuration "LocationConstraint=${REGION}"
    fi
    aws "${AWS_ARGS[@]}" s3api put-public-access-block --bucket "${BUCKET}" \
        --public-access-block-configuration \
        'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
    aws "${AWS_ARGS[@]}" s3api put-bucket-encryption --bucket "${BUCKET}" \
        --server-side-encryption-configuration \
        '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
    # Versioning keeps every artifact addressable for a rollback.
    aws "${AWS_ARGS[@]}" s3api put-bucket-versioning --bucket "${BUCKET}" \
        --versioning-configuration 'Status=Enabled'
    ok "created"
fi

step "Uploading ${ARTIFACT_KEY}"
if aws "${AWS_ARGS[@]}" s3api head-object --bucket "${BUCKET}" --key "${ARTIFACT_KEY}" >/dev/null 2>&1; then
    dim "identical artifact already uploaded — reusing it"
else
    aws "${AWS_ARGS[@]}" s3 cp "${ZIP_PATH}" "s3://${BUCKET}/${ARTIFACT_KEY}" --only-show-errors
    ok "uploaded"
fi

if [[ "${PACKAGE_ONLY}" == true ]]; then
    step "Package only — stopping before the stack deploy"
    info "s3://${BUCKET}/${ARTIFACT_KEY}"
    exit 0
fi

# ---------------------------------------------------------------------------
# 4. deploy the stack
# ---------------------------------------------------------------------------

# API Gateway stores its CloudWatch Logs role per account+region. Stage access
# logging fails at create time if nothing has set it, so let this stack own it
# only when the account setting is still empty.
MANAGE_APIGW_ACCOUNT=false
EXISTING_ROLE="$(aws "${AWS_ARGS[@]}" apigateway get-account --query 'cloudwatchRoleArn' --output text 2>/dev/null || echo 'None')"
if [[ "${EXISTING_ROLE}" == "None" || -z "${EXISTING_ROLE}" ]]; then
    MANAGE_APIGW_ACCOUNT=true
    warn "API Gateway has no account-level CloudWatch role; this stack will create one"
else
    dim "API Gateway CloudWatch role already set (${EXISTING_ROLE})"
fi

step "Deploying ${STACK}"
aws "${AWS_ARGS[@]}" cloudformation deploy \
    --template-file "${TEMPLATE}" \
    --stack-name "${STACK}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --tags "Project=${PROJECT}" "Environment=${ENV_NAME}" "ManagedBy=deploy.sh" \
    --parameter-overrides \
        "ProjectName=${PROJECT}" \
        "Environment=${ENV_NAME}" \
        "ArtifactBucket=${BUCKET}" \
        "ArtifactKey=${ARTIFACT_KEY}" \
        "CognitoUserPoolId=${POOL_ID}" \
        "CognitoUserPoolClientId=${CLIENT_ID}" \
        "CognitoUserPoolArn=${POOL_ARN}" \
        "CognitoClientSecretArn=${SECRET_ARN}" \
        "ApiStageName=${STAGE_NAME}" \
        "CorsAllowOrigin=${CORS_ORIGIN}" \
        "LogRetentionInDays=${LOG_RETENTION}" \
        "ManageApiGatewayAccount=${MANAGE_APIGW_ACCOUNT}"

# ---------------------------------------------------------------------------
# 5. report
# ---------------------------------------------------------------------------

step "Stack outputs"
aws "${AWS_ARGS[@]}" cloudformation describe-stacks \
    --stack-name "${STACK}" \
    --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
    --output text | while IFS=$'\t' read -r key value; do
        printf '    %-24s %s\n' "${key}" "${value}"
    done

API_URL="$(aws "${AWS_ARGS[@]}" cloudformation describe-stacks \
    --stack-name "${STACK}" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiInvokeUrl`].OutputValue' --output text)"

echo
ok "deployed"
info "Point the frontend at it with:"
dim "VITE_API_BASE_URL=${API_URL}"
