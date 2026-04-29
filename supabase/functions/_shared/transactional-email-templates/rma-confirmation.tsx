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

interface RmaConfirmationProps {
  customerName?: string
  rmaNumber?: string
  productName?: string
  productModel?: string
  serialNumber?: string
  issueType?: string
  createdDate?: string
  trackUrl?: string
  shippingUrl?: string
}

const RmaConfirmationEmail = ({
  customerName = '客戶',
  rmaNumber = '',
  productName = '保固服務商品',
  productModel = '',
  serialNumber = '',
  issueType = '',
  createdDate = '',
  trackUrl = 'https://rma-helper-hub.lovable.app/track',
  shippingUrl = 'https://rma-helper-hub.lovable.app/shipping-form',
}: RmaConfirmationProps) => (
  <Html lang="zh-TW" dir="ltr">
    <Head />
    <Preview>已收到您的 CREST 保固服務申請 (RMA: {rmaNumber})</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>已收到您的保固服務申請</Heading>
        <Text style={text}>{customerName} 您好，</Text>
        <Text style={text}>
          感謝您申請 {SITE_NAME}。我們已收到您的申請資料，以下為您填寫的內容，請妥善保留此信件以供日後查詢。
        </Text>

        <Section style={infoBox}>
          <Text style={infoLine}><strong>RMA 編號：</strong>{rmaNumber}</Text>
          <Text style={infoLine}><strong>商品：</strong>{productName}</Text>
          {productModel ? (
            <Text style={infoLine}><strong>產品型號：</strong>{productModel}</Text>
          ) : null}
          {serialNumber ? (
            <Text style={infoLine}><strong>序號：</strong>{serialNumber}</Text>
          ) : null}
          {issueType ? (
            <Text style={infoLine}><strong>故障類型：</strong>{issueType}</Text>
          ) : null}
          {createdDate ? (
            <Text style={infoLine}><strong>申請日期：</strong>{createdDate}</Text>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button style={buttonPrimary} href={trackUrl}>
            查詢申請進度
          </Button>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>關於寄回商品</Heading>
        <Section style={notice}>
          <Text style={noticeText}>
            <strong>提醒：並非所有 RMA 申請都需要寄回商品。</strong>
            部分問題（例如使用諮詢、軟體設定、操作說明等）可由客服遠端協助處理。
          </Text>
          <Text style={noticeText}>
            請等候我們審核後通知，或經客服確認需要寄回後，再點擊下方按鈕填寫寄件資訊。
          </Text>
        </Section>

        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={buttonSecondary} href={shippingUrl}>
            填寫寄件資訊（如需寄回）
          </Button>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>寄件須知（如經確認需寄回）</Heading>
        <Text style={text}>
          本公司收件地址如下：<br />
          <strong>242039 新北市新莊區化成路11巷86號1樓</strong>
        </Text>
        <Text style={text}>
          英文地址：<br />
          <strong>No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039</strong>
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
  component: RmaConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `CREST 保固服務：已收到您的申請${data?.rmaNumber ? ` (${data.rmaNumber})` : ''}`,
  displayName: 'RMA 申請確認',
  previewData: {
    customerName: '王小明',
    rmaNumber: 'RC-7EA-057-459',
    productName: 'CREST CR-4 潛水電腦錶',
    productModel: 'CR-4',
    serialNumber: 'SN20260001',
    issueType: '硬體故障',
    createdDate: '2026年4月29日',
    trackUrl: 'https://rma-helper-hub.lovable.app/track?rma=RC-7EA-057-459',
    shippingUrl: 'https://rma-helper-hub.lovable.app/shipping-form?rma=RC-7EA-057-459',
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
const buttonPrimary = {
  backgroundColor: '#3B82F6',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const buttonSecondary = {
  backgroundColor: '#ffffff',
  color: '#3B82F6',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '10px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
  border: '1.5px solid #3B82F6',
}
const notice = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '8px',
  padding: '14px 18px',
  margin: '12px 0',
}
const noticeText = { fontSize: '13px', color: '#78350f', lineHeight: '1.6', margin: '0 0 8px' }
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
