const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2')
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns')

const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' })
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' })

async function sendEmailOtp({ identifier, otp }) {
    const command = new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_EMAIL,
        Destination: { ToAddresses: [identifier] },
        Content: {
            Simple: {
                Subject: { Data: 'Your verification code' },
                Body: { Text: { Data: `Your one-time code is ${otp}. It expires in a few minutes.` } },
            },
        },
    })
    return sesClient.send(command)
}

async function sendSmsOtp({ identifier, otp }) {
    const command = new PublishCommand({
        PhoneNumber: identifier,
        Message: `Your one-time code is ${otp}. It expires in a few minutes.`,
    })
    return snsClient.send(command)
}

/**
 * Pluggable OTP delivery. Default: SES for email identifiers, SNS for phone
 * identifiers. Pass a custom { sendOtp } implementation to swap providers
 * (Twilio, SendGrid, etc.) without touching handler code.
 */
function createDefaultNotifier() {
    return {
        async sendOtp({ identifier, identifier_type, otp }) {
            if (identifier_type === 'phone') {
                return sendSmsOtp({ identifier, otp })
            }
            return sendEmailOtp({ identifier, otp })
        },
    }
}

module.exports = { createDefaultNotifier }
