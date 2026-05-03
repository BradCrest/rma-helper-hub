import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CREST 保固服務'

interface AttachmentEntry {
  name: string
  url: string
  size?: number
}

interface CustomerEmailReplyProps {
  customerName?: string
  rmaNumber?: string
  replyBody?: string
  attachments?: AttachmentEntry[]
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CustomerEmailReplyEmail = ({
  customerName = '您好',
  rmaNumber = '',
  replyBody = '',
  attachments = [],
}: CustomerEmailReplyProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>來自 {SITE_NAME} 客服的回覆 / Reply from CREST Customer Service</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          客服回覆<br />
          <span style={h1Sub}>Customer Service Reply</span>
        </Heading>
        <Text style={text}>
          {customerName}，您好，<br />
          <span style={textEn}>Dear {customerName},</span>
        </Text>
        <Text style={text}>
          感謝您的來信，以下是我們的回覆：<br />
          <span style={textEn}>Thank you for contacting us. Please see our reply below:</span>
        </Text>

        <Section style={replyBox}>
          <Text style={replyText}>{replyBody}</Text>
        </Section>

        {rmaNumber ? (
          <Text style={text}>
            參考編號 / Reference No.：<strong style={strong}>{rmaNumber}</strong>
          </Text>
        ) : null}

        {attachments && attachments.length > 0 ? (
          <Section style={attachmentBox}>
            <Text style={attachmentTitle}>
              📎 附件 / Attachments（{attachments.length}）
            </Text>
            {attachments.map((a, idx) => (
              <Section key={idx} style={attachmentRow}>
                <Link href={a.url} style={attachmentLink}>
                  📄 {a.name}
                </Link>
                {a.size ? (
                  <Text style={attachmentSize}>{formatBytes(a.size)}</Text>
                ) : null}
              </Section>
            ))}
            <Text style={attachmentNote}>
              附件下載連結 30 天內有效。/ Attachment download links are valid for 30 days.
            </Text>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={notice}>
          此信件由系統自動寄出，請勿直接回覆此 Email。如需進一步聯繫，請來信至本公司客服信箱，我們將儘速為您處理。<br />
          This email was sent automatically. Please do not reply directly. For further assistance, please contact our customer service team and we will respond as soon as possible.
        </Text>
        <Text style={footer}>{SITE_NAME} 客服團隊 / Customer Service</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CustomerEmailReplyEmail,
  subject: (data: Record<string, any>) =>
    (data?.subject as string) || `來自 ${SITE_NAME} 客服的回覆 / Reply from CREST Customer Service`,
  displayName: '客戶來信回覆',
  previewData: {
    customerName: '王小明',
    rmaNumber: 'RC7EA059461',
    replyBody:
      '您好，關於您詢問的保固範圍，已為您查詢如下：本產品保固期為購買日起 2 年，正常使用範圍內的故障皆可免費維修。',
    attachments: [
      {
        name: '保固政策說明.pdf',
        url: 'https://example.com/sample-policy.pdf',
        size: 124000,
      },
    ],
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang TC","Microsoft JhengHei",sans-serif',
}
const container = { maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 24px', lineHeight: '1.4' }
const h1Sub = { fontSize: '15px', fontWeight: 'normal' as const, color: '#64748b' }
const text = { fontSize: '14px', color: '#1f2937', lineHeight: '1.6', margin: '0 0 14px' }
const textEn = { fontSize: '13px', color: '#64748b' }
const strong = { color: '#0f172a' }
const replyBox = {
  background: '#f9fafb',
  borderLeft: '4px solid #3B82F6',
  padding: '16px 20px',
  margin: '16px 0 24px',
  borderRadius: '4px',
}
const replyText = {
  fontSize: '14px',
  color: '#1f2937',
  lineHeight: '1.7',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const notice = { fontSize: '12px', color: '#6b7280', margin: '0 0 8px', lineHeight: '1.6' }
const footer = { fontSize: '13px', color: '#6b7280', margin: '8px 0 0' }
const attachmentBox = {
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  padding: '14px 18px',
  margin: '0 0 24px',
  borderRadius: '6px',
}
const attachmentTitle = {
  fontSize: '13px',
  fontWeight: 600 as const,
  color: '#0f172a',
  margin: '0 0 10px',
}
const attachmentRow = { margin: '0 0 6px' }
const attachmentLink = {
  fontSize: '14px',
  color: '#3B82F6',
  textDecoration: 'none',
  fontWeight: 500 as const,
  wordBreak: 'break-all' as const,
}
const attachmentSize = { fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 20px' }
const attachmentNote = { fontSize: '11px', color: '#94a3b8', margin: '8px 0 0' }
