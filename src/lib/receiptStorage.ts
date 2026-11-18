import { supabase } from './supabase';

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

export async function uploadReceipt(
  transferId: number,
  file: File
): Promise<string> {
  validateReceipt(file);

  if (!transferId || transferId <= 0) {
    throw new Error('ID transfer tidak valid.');
  }

  return uploadTransactionReceipt(`transfers/${transferId}`, file);
}

export async function uploadTransactionReceipt(
  folder: string,
  file: File
): Promise<string> {
  validateReceipt(file);

  const extension = file.name.split('.').pop()?.toLowerCase() || 'file';

  const filePath = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    throw new Error('Gagal mengunggah bukti: ' + error.message);
  }

  return filePath;
}

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

export async function deleteReceipt(filePath: string): Promise<void> {
  if (!filePath) return;

  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);

  if (error) {
    throw new Error('Gagal menghapus bukti: ' + error.message);
  }
}
