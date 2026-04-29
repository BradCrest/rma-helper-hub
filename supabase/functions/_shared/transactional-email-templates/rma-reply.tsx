import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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

interface RmaReplyProps {
  customerName?: string
  rmaNumber?: string
  replyBody?: string
  replyUrl?: string
  attachments?: AttachmentEntry[]
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const RmaReplyEmail = ({
  customerName = '客戶',
  rmaNumber = '',
  replyBody = '',
  replyUrl = '',
  attachments = [],
}: RmaReplyProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>
      {rmaNumber ? `[${rmaNumber}] ` : ''}您的維修申請進度回覆
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>維修申請進度回覆</Heading>
        <Text style={text}>您好 {customerName}，</Text>
        <Text style={text}>
          關於您的維修申請{' '}
          <strong style={strong}>{rmaNumber}</strong>，我們的回覆如下：
        </Text>

        <Section style={replyBox}>
          <Text style={replyText}>{replyBody}</Text>
        </Section>

        {attachments && attachments.length > 0 ? (
          <Section style={attachmentBox}>
            <Text style={attachmentTitle}>
              📎 附件（{attachments.length}）
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
              附件下載連結 30 天內有效。
            </Text>
          </Section>
        ) : null}

        {replyUrl ? (
          <>
            <Text style={text}>
              若您針對這個回覆有進一步的疑問或說明，請點擊下方按鈕填寫，您的回覆會直接記錄到本筆維修申請中。
            </Text>
            <Section style={btnSection}>
              <Button style={btn} href={replyUrl}>
                填寫我的回覆
              </Button>
            </Section>
            <Text style={smallText}>
              或複製此連結到瀏覽器開啟：
              <br />
              <Link href={replyUrl} style={linkStyle}>
                {replyUrl}
              </Link>
              <br />
              （連結 30 天內有效，僅可使用一次）
            </Text>
          </>
        ) : null}

        <Hr style={hr} />
        <Text style={notice}>
          此信件由系統自動寄出，請勿直接回覆此 Email。如需進一步聯繫，請使用上方按鈕回覆，所有對話皆會集中於本筆申請紀錄中。
        </Text>
        <Text style={footer}>{SITE_NAME} 客服團隊</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RmaReplyEmail,
  subject: (data: Record<string, any>) =>
    (data?.subject as string) ||
    `Re: [${data?.rmaNumber ?? ''}] 您的維修申請進度回覆`,
  displayName: 'RMA 回覆給客戶',
  previewData: {
    customerName: '王小明',
    rmaNumber: 'RC7EA059461',
    replyBody:
      '您好，您的產品已收到，初步檢測為防水墊圈老化，預計 3 個工作天內完成更換並回寄。隨信附上維修報價單供您參考。',
    replyUrl: 'https://rma-helper-hub.lovable.app/rma-reply/sample-token',
    attachments: [
      {
        name: '維修報價單.pdf',
        url: 'https://example.com/sample-quote.pdf',
        size: 124000,
      },
      {
        name: '產品檢測照片.jpg',
        url: 'https://example.com/sample-photo.jpg',
        size: 856000,
      },
    ],
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang TC","Microsoft JhengHei",sans-serif',
}
const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '32px 24px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#0f172a',
  margin: '0 0 24px',
}
const text = {
  fontSize: '14px',
  color: '#1f2937',
  lineHeight: '1.6',
  margin: '0 0 14px',
}
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
const btnSection = { textAlign: 'center' as const, margin: '24px 0' }
const btn = {
  background: '#3B82F6',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '14px',
  display: 'inline-block',
}
const linkStyle = { color: '#3B82F6', wordBreak: 'break-all' as const }
const smallText = {
  fontSize: '12px',
  color: '#6b7280',
  lineHeight: '1.5',
  margin: '0 0 24px',
}
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const notice = { fontSize: '12px', color: '#6b7280', margin: '0 0 8px' }
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
const attachmentSize = {
  fontSize: '11px',
  color: '#94a3b8',
  margin: '2px 0 0 20px',
}
const attachmentNote = {
  fontSize: '11px',
  color: '#94a3b8',
  margin: '8px 0 0',
}
