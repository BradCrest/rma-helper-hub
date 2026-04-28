import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CREST 保固服務'

interface ShippingReminderProps {
  customerName?: string
  rmaNumber?: string
  productName?: string
  createdDate?: string
  shippingUrl?: string
}

const ShippingReminderEmail = ({
  customerName = '客戶',
  rmaNumber = '',
  productName = '保固服務商品',
  createdDate = '',
  shippingUrl = 'https://rma-helper-hub.lovable.app/shipping',
}: ShippingReminderProps) => (
  <Html lang="zh-TW" dir="ltr">
    <Head />
    <Preview>提醒您：請填寫保固服務寄件資訊 (RMA: {rmaNumber})</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>提醒您：請填寫寄件資訊</Heading>
        <Text style={text}>{customerName} 您好，</Text>
        <Text style={text}>
          感謝您申請 {SITE_NAME}。我們注意到您的保固服務申請已建立超過 48 小時，但尚未收到您的寄件資訊。
          為了讓我們盡快為您處理，請點擊下方按鈕填寫寄件資訊。
        </Text>

        <Section style={infoBox}>
          <Text style={infoLine}><strong>RMA 編號：</strong>{rmaNumber}</Text>
          <Text style={infoLine}><strong>商品：</strong>{productName}</Text>
          {createdDate ? (
            <Text style={infoLine}><strong>申請日期：</strong>{createdDate}</Text>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center', margin: '30px 0' }}>
          <Button style={button} href={shippingUrl}>
            立即填寫寄件資訊
          </Button>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>寄件須知</Heading>
        <Text style={text}>
          請將商品寄至以下地址：<br />
          <strong>新北市汐止區康寧街169巷31號5樓</strong><br />
          收件人：CREST 保固服務中心
        </Text>
        <Text style={warning}>
          ⚠️ 為避免遺失，本服務中心 <strong>無法接受親送</strong>，請務必透過物流寄送。
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          如有任何疑問，請回覆此信件或聯繫我們。<br />
          {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ShippingReminderEmail,
  subject: (data: Record<string, any>) =>
    `提醒您：請填寫保固服務寄件資訊${data?.rmaNumber ? ` (${data.rmaNumber})` : ''}`,
  displayName: '48 小時未寄件提醒',
  previewData: {
    customerName: '王小明',
    rmaNumber: 'RC-2A-01-001',
    productName: 'CREST CR-4 潛水電腦錶',
    createdDate: '2026年4月25日',
    shippingUrl: 'https://rma-helper-hub.lovable.app/shipping?rma=RC-2A-01-001&autoopen=1',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, "PingFang TC", "Microsoft JhengHei", sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const h2 = { fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '20px 0 10px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const infoBox = {
  backgroundColor: '#f1f5f9',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const infoLine = { fontSize: '14px', color: '#0f172a', margin: '4px 0', lineHeight: '1.5' }
const button = {
  backgroundColor: '#3B82F6',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const warning = {
  fontSize: '13px',
  color: '#b91c1c',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '10px 14px',
  margin: '12px 0',
  lineHeight: '1.5',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '20px 0 0', lineHeight: '1.5' }
