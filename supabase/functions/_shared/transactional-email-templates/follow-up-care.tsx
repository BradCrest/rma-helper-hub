/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CREST 保固服務'

interface FollowUpCareProps {
  customerName?: string
  rmaNumber?: string
  productModel?: string
  messageBody?: string
  surveyUrl?: string
}

const FollowUpCareEmail = ({
  customerName = '您好',
  rmaNumber = '',
  productModel = '',
  messageBody = '',
  surveyUrl = '',
}: FollowUpCareProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>關於您 RMA {rmaNumber} 的後續關懷 / Follow-Up Care for Your RMA {rmaNumber}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          後續關懷<br />
          <span style={h1Sub}>Follow-Up Care</span>
        </Heading>
        <Text style={text}>
          {customerName}，您好，<br />
          <span style={textEn}>Dear {customerName},</span>
        </Text>

        <Section style={replyBox}>
          <Text style={replyText}>{messageBody}</Text>
        </Section>

        {(rmaNumber || productModel) ? (
          <Section style={infoBox}>
            {rmaNumber ? (
              <Text style={infoLine}>RMA 編號 / RMA No.：<strong>{rmaNumber}</strong></Text>
            ) : null}
            {productModel ? (
              <Text style={infoLine}>產品型號 / Model：<strong>{productModel}</strong></Text>
            ) : null}
          </Section>
        ) : null}

        {surveyUrl ? (
          <Section style={surveySection}>
            <Text style={surveyTitle}>📝 滿意度問卷 / Satisfaction Survey（30 秒 / 30 sec）</Text>
            <Text style={surveyText}>
              為了持續提升服務品質，懇請您撥冗填寫簡短的滿意度問卷：<br />
              <span style={textEn}>To help us improve our service, we'd appreciate a quick satisfaction survey:</span>
            </Text>
            <Button href={surveyUrl} style={surveyButton}>
              填寫滿意度問卷 / Take the Survey
            </Button>
            <Text style={surveyFallback}>
              或複製此連結至瀏覽器 / Or copy this link to your browser：<br />
              <Link href={surveyUrl} style={link}>{surveyUrl}</Link>
            </Text>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={notice}>
          此信件由系統自動寄出，請勿直接回覆此 Email。如有任何疑問，請來信至本公司客服信箱。<br />
          This email was sent automatically. Please do not reply directly. For any questions, please contact our customer service team.
        </Text>
        <Text style={footer}>{SITE_NAME} 客服團隊 / Customer Service</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FollowUpCareEmail,
  subject: (data: Record<string, any>) =>
    (data?.subject as string) || `${SITE_NAME} — 關於您 RMA ${data?.rmaNumber ?? ''} 的後續關懷 / Follow-Up Care for Your RMA`,
  displayName: '客戶關懷信',
  previewData: {
    customerName: '王小明',
    rmaNumber: 'RC7EA059461',
    productModel: 'CR-4',
    messageBody:
      '您好，距離我們寄出維修品已過了一段時間，想關心一下您的使用狀況是否一切順利？若有任何問題，歡迎隨時與我們聯繫。',
    surveyUrl: 'https://example.com/follow-up-survey/abc123',
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
const infoBox = {
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  padding: '12px 16px',
  margin: '0 0 24px',
  borderRadius: '6px',
}
const infoLine = { fontSize: '13px', color: '#0f172a', margin: '4px 0' }
const surveySection = {
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  padding: '20px',
  margin: '0 0 24px',
  borderRadius: '8px',
  textAlign: 'center' as const,
}
const surveyTitle = {
  fontSize: '15px', fontWeight: 600 as const, color: '#1e40af', margin: '0 0 12px',
}
const surveyText = {
  fontSize: '14px', color: '#1e40af', lineHeight: '1.6', margin: '0 0 12px',
}
const surveyButton = {
  background: '#3B82F6',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600 as const,
  textDecoration: 'none',
  display: 'inline-block',
  margin: '12px 0',
}
const surveyFallback = { fontSize: '11px', color: '#64748b', margin: '12px 0 0' }
const link = { color: '#3B82F6', wordBreak: 'break-all' as const }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const notice = { fontSize: '12px', color: '#6b7280', margin: '0 0 8px', lineHeight: '1.6' }
const footer = { fontSize: '13px', color: '#6b7280', margin: '8px 0 0' }
