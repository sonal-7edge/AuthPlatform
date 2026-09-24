#!/usr/bin/env bash
#
# Deploys this auth service.
#
#   npm run deploy:env       # read .env, build, deploy
#   npm run destroy          # tear the stack down
#
# Everything that varies lives in .env. The stack name is derived from
# ProjectName and Environment, so two environments never collide and nothing
# has to be edited in samconfig.toml.

set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
    C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
else
    C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''
fi
step() { printf '%s==>%s %s\n' "${C_BOLD}" "${C_RESET}" "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%swarn%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
ok()   { printf '%s ok %s %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
die()  { printf '%serror%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }

DESTROY=0
[[ "${1:-}" == "--destroy" ]] && DESTROY=1

# --------------------------------------------------------------- .env
[[ -f .env ]] || die ".env not found. Copy .env.example to .env and fill it in."
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# --------------------------------------------------- required settings
missing=()
for v in ProjectName Environment CognitoUserPoolId CognitoUserPoolArn \
         CognitoUserPoolClientId RESET_TOKEN_SECRET; do
    [[ -n "${!v:-}" ]] || missing+=("$v")
done
((${#missing[@]})) && die "missing in .env: ${missing[*]}"

# ------------------------------------------------------------ defaults
: "${ApiStageName:=v1}"
: "${CorsAllowOrigin:=*}"
: "${LogRetentionInDays:=30}"
: "${LogLevel:=info}"
: "${ThrottlingRateLimit:=50}"
: "${ThrottlingBurstLimit:=100}"
: "${ManageApiGatewayAccount:=false}"
: "${CognitoClientSecret:=}"
: "${ResetTokenTtlSeconds:=600}"

# Region: .env wins, then the usual AWS variables, then the ARN itself.
: "${AWS_REGION:=${AWS_DEFAULT_REGION:-}}"
if [[ -z "$AWS_REGION" ]]; then
    AWS_REGION="$(cut -d: -f4 <<<"$CognitoUserPoolArn")"
fi
[[ -n "$AWS_REGION" ]] || die "no region: set AWS_REGION in .env"

# The whole point of this script — a stack name that follows .env.
STACK_NAME="${StackName:-${ProjectName}-${Environment}}"

# ---------------------------------------------------------- preflight
# A user pool ARN from another account fails deep inside CloudFormation with
# an opaque AWS::EarlyValidation::ResourceExistenceCheck error, so check here
# where the message can actually say what is wrong.
ARN_ACCOUNT="$(cut -d: -f5 <<<"$CognitoUserPoolArn")"
ARN_REGION="$(cut -d: -f4 <<<"$CognitoUserPoolArn")"
ARN_POOL="${CognitoUserPoolArn##*/}"

if CALLER_ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
    if [[ "$ARN_ACCOUNT" != "$CALLER_ACCOUNT" ]]; then
        die "CognitoUserPoolArn is in account ${ARN_ACCOUNT}, but your credentials are for ${CALLER_ACCOUNT}.
       CloudFormation will reject this as ResourceExistenceCheck.
       Fix CognitoUserPoolArn in .env, or switch AWS profile."
    fi
else
    warn "could not reach STS — skipping the account check"
fi

[[ "$ARN_POOL" == "$CognitoUserPoolId" ]] || \
    die "CognitoUserPoolArn ends in '${ARN_POOL}' but CognitoUserPoolId is '${CognitoUserPoolId}'."
[[ "$ARN_REGION" == "$AWS_REGION" ]] || \
    warn "pool ARN is in ${ARN_REGION} but deploying to ${AWS_REGION}"

step "stack ${C_BOLD}${STACK_NAME}${C_RESET} in ${AWS_REGION}"
info "project     ${ProjectName} / ${Environment}"
info "user pool   ${CognitoUserPoolId}"

# ------------------------------------------------------------ destroy
if ((DESTROY)); then
    step "deleting ${STACK_NAME}"
    sam delete --stack-name "$STACK_NAME" --region "$AWS_REGION"
    ok "deleted"
    exit 0
fi

# ------------------------------------------------------------- deploy
step "validating"
sam validate -t template.yaml --lint --region "$AWS_REGION"

step "building"
sam build -t template.yaml --cached --parallel

step "deploying"
sam deploy \
    --stack-name "$STACK_NAME" \
    --s3-prefix "$STACK_NAME" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
        ProjectName="$ProjectName" \
        Environment="$Environment" \
        ApiStageName="$ApiStageName" \
        CognitoUserPoolId="$CognitoUserPoolId" \
        CognitoUserPoolArn="$CognitoUserPoolArn" \
        CognitoUserPoolClientId="$CognitoUserPoolClientId" \
        CognitoClientSecret="$CognitoClientSecret" \
        ResetTokenSecret="$RESET_TOKEN_SECRET" \
        ResetTokenTtlSeconds="$ResetTokenTtlSeconds" \
        CorsAllowOrigin="$CorsAllowOrigin" \
        LogRetentionInDays="$LogRetentionInDays" \
        LogLevel="$LogLevel" \
        ThrottlingRateLimit="$ThrottlingRateLimit" \
        ThrottlingBurstLimit="$ThrottlingBurstLimit" \
        ManageApiGatewayAccount="$ManageApiGatewayAccount"

ok "deployed ${STACK_NAME}"
