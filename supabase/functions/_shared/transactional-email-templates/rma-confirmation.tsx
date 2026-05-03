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
    <Preview>已收到您的 CREST 保固服務申請 / We Have Received Your CREST Service Request (RMA: {rmaNumber})</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          已收到您的保固服務申請<br />
          <span style={h1Sub}>We Have Received Your Service Request</span>
        </Heading>
        <Text style={text}>
          {customerName} 您好，<br />
          <span style={textEn}>Dear {customerName},</span>
        </Text>
        <Text style={text}>
          感謝您申請 {SITE_NAME}。我們已收到您的申請資料，以下為您填寫的內容，請妥善保留此信件以供日後查詢。<br />
          <span style={textEn}>Thank you for submitting your service request. We have received your application. Please keep this email for future reference.</span>
        </Text>

        <Section style={infoBox}>
          <Text style={infoLine}><strong>RMA 編號 / RMA No.：</strong>{rmaNumber}</Text>
          <Text style={infoLine}><strong>商品 / Product：</strong>{productName}</Text>
          {productModel ? (
            <Text style={infoLine}><strong>產品型號 / Model：</strong>{productModel}</Text>
          ) : null}
          {serialNumber ? (
            <Text style={infoLine}><strong>序號 / Serial No.：</strong>{serialNumber}</Text>
          ) : null}
          {issueType ? (
            <Text style={infoLine}><strong>故障類型 / Issue Type：</strong>{issueType}</Text>
          ) : null}
          {createdDate ? (
            <Text style={infoLine}><strong>申請日期 / Date：</strong>{createdDate}</Text>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button style={buttonPrimary} href={trackUrl}>
            查詢申請進度 / Track Status
          </Button>
          <span style={{ display: 'inline-block', width: '12px' }} />
          <Button style={buttonSecondary} href={shippingUrl}>
            填寫寄件資訊 / Submit Shipping Info
          </Button>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>
          寄件須知 / Shipping Instructions
        </Heading>
        <Section style={addressBox}>
          <Text style={addrPara}>
            為避免影響您的保固服務時程，請將產品正確寄至以下地址。<br />
            <span style={textEn}>To avoid any delay in your warranty service, please send the product to the following address:</span>
          </Text>
          <Text style={addrPara}>
            <strong>八洋精密股份有限公司</strong><br />
            客服部<br />
            電話：02-2994-7450<br />
            <strong>地址：242039 新北市新莊區化成路11巷86號1樓</strong>
          </Text>
          <Text style={addrParaLast}>
            <strong>EOPI CO., LTD</strong><br />
            Customer Service Dept.<br />
            TEL: 886-2-2994-7450<br />
            <strong>Address: No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039</strong>
          </Text>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          如有任何疑問，請回覆此信件或聯繫我們。<br />
          <span style={textEn}>If you have any questions, please reply to this email or contact us.</span><br />
          {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RmaConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `CREST 保固服務：已收到您的申請 / Service Request Received${data?.rmaNumber ? ` (${data.rmaNumber})` : ''}`,
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
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px', lineHeight: '1.4' }
const h1Sub = { fontSize: '15px', fontWeight: 'normal' as const, color: '#64748b' }
const h2 = { fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '20px 0 10px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const textEn = { fontSize: '13px', color: '#64748b' }
const infoBox = {
  backgroundColor: '#f1f5f9',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const addressBox = {
  backgroundColor: '#f8fafc',
  borderLeft: '3px solid #3B82F6',
  borderRadius: '4px',
  padding: '12px 16px',
  margin: '8px 0 16px',
}
const infoLine = { fontSize: '14px', color: '#0f172a', margin: '4px 0', lineHeight: '1.5' }
const buttonPrimary = {
  backgroundColor: '#3B82F6',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '11px 22px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const buttonSecondary = {
  backgroundColor: '#ffffff',
  color: '#3B82F6',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '10px 20px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
  border: '1.5px solid #3B82F6',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const addrPara = { fontSize: '14px', color: '#0f172a', lineHeight: '1.8', margin: '0 0 16px' }
const addrParaLast = { fontSize: '14px', color: '#0f172a', lineHeight: '1.8', margin: '0' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '20px 0 0', lineHeight: '1.5' }
