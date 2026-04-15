/**
 * Send a WhatsApp notification via CallMeBot.
 * Returns true if sent, false if skipped or failed.
 */
export async function sendCallMeBotNotification(message: string): Promise<boolean> {
  const phone = process.env.CALLMEBOT_PHONE;
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!phone || !apiKey) return false;

  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("CallMeBot HTTP error:", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (e) {
    console.error("CallMeBot error:", e);
    return false;
  }
}
