import { supabase } from '../lib/supabase';

const BUCKET = 'payment-receipts';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

function validateReceipt(file: File) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Format bukti harus JPG, PNG, WEBP, atau PDF.');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Ukuran bukti maksimal 5 MB.');
  }
}

function getExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() || 'file';
}

// Upload bukti transfer lama
export async function uploadReceipt(
  transferId: number,
  file: File
): Promise<string> {
  validateReceipt(file);

  if (!transferId || transferId <= 0) {
    throw new Error('ID transfer tidak valid.');
  }

  const filePath = `${transferId}/${crypto.randomUUID()}.${getExtension(file)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    throw new Error('Gagal mengunggah bukti transfer: ' + error.message);
  }

  return filePath;
}

// Upload bukti transaksi uang masuk dan uang keluar
export async function uploadTransactionReceipt(
  type: 'income' | 'expense',
  file: File
): Promise<string> {
  validateReceipt(file);

  const filePath = `transactions/${type}/${crypto.randomUUID()}.${getExtension(
    file
  )}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    throw new Error('Gagal mengunggah bukti transaksi: ' + error.message);
  }

  return filePath;
}

// Membuka bukti menggunakan signed URL
export async function getReceiptUrl(filePath: string): Promise<string> {
  if (!filePath) {
    throw new Error('Lokasi bukti tidak ditemukan.');
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600);

  if (error) {
    throw new Error('Gagal membuka bukti: ' + error.message);
  }

  return data.signedUrl;
}

// Menghapus bukti dari penyimpanan
export async function deleteReceipt(filePath: string): Promise<void> {
  if (!filePath) return;

  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);

  if (error) {
    throw new Error('Gagal menghapus bukti: ' + error.message);
  }
}
