import { Expo } from 'expo-server-sdk';

const expo = new Expo();

/**
 * Send push notifications to one or more Expo push tokens.
 * Handles chunking, ticket collection, and receipt-based dead-token detection.
 * Returns an array of tokens confirmed dead (DeviceNotRegistered) so the caller
 * can $pull them from the user document.
 */
export async function sendPush(tokens, { title, body, data = {} }) {
  const valid = tokens.filter(Expo.isExpoPushToken);
  if (!valid.length) return [];

  const messages = valid.map(to => ({ to, title, body, data, sound: 'default' }));
  const deadTokens = [];
  const receiptIdToToken = new Map();

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    let tickets;
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('[push] chunk send failed', err);
      continue;
    }

    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error') {
        if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(chunk[i].to);
        else console.warn('[push] ticket error', ticket.message, ticket.details);
      } else if (ticket.id) {
        receiptIdToToken.set(ticket.id, chunk[i].to);
      }
    });
  }

  // Second pass: check receipts for additional DeviceNotRegistered errors.
  if (receiptIdToToken.size) {
    const ids = [...receiptIdToToken.keys()];
    try {
      for (const idChunk of expo.chunkPushNotificationReceiptIds(ids)) {
        const receipts = await expo.getPushNotificationReceiptsAsync(idChunk);
        for (const [id, receipt] of Object.entries(receipts)) {
          if (receipt.status === 'error') {
            console.warn('[push] receipt error', id, receipt.message, receipt.details);
            if (receipt.details?.error === 'DeviceNotRegistered') {
              const tok = receiptIdToToken.get(id);
              if (tok) deadTokens.push(tok);
            }
          }
        }
      }
    } catch (err) {
      console.error('[push] receipt check failed', err);
    }
  }

  return deadTokens;
}
