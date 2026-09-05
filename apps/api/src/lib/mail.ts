import { env } from "../env.js";

const SENDCLOUD_URL = "https://api.sendcloud.net/apiv2/mail/send";

type SendCloudResponse = {
  result?: boolean;
  statusCode?: number;
  message?: string;
};

export async function sendLoginCode(email: string, code: string) {
  if (!env.SENDCLOUD_API_USER || !env.SENDCLOUD_API_KEY || !env.SENDCLOUD_FROM) {
    return false;
  }

  const html = `
    <p>你的 AppUnions 登录验证码是：</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>
    <p>10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>
  `;

  const body = new URLSearchParams({
    apiUser: env.SENDCLOUD_API_USER,
    apiKey: env.SENDCLOUD_API_KEY,
    from: env.SENDCLOUD_FROM,
    fromName: env.SENDCLOUD_FROM_NAME,
    to: email,
    subject: "AppUnions 登录验证码",
    html,
    plain: `你的验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
  });

  const res = await fetch(SENDCLOUD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as SendCloudResponse;
  if (!res.ok || !data.result) {
    throw new Error(data.message || `SendCloud 发送失败 (${res.status})`);
  }
  return true;
}
