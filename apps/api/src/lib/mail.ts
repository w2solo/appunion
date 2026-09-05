import nodemailer from "nodemailer";
import { env } from "../env.js";

export async function sendLoginCode(email: string, code: string) {
  if (!env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER || "noreply@appunions.local",
    to: email,
    subject: "AppUnions 登录验证码",
    text: `你的验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
  });
  return true;
}
