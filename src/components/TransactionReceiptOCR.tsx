import { useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

type Props = {
  onTextExtracted: (text: string) => void;
  onFileSelected?: (file: File | null) => void;
};

export default function TransactionReceiptOCR({
  onTextExtracted,
  onFileSelected,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  async function processOCR(selectedFile: File) {
    if (!selectedFile.type.startsWith('image/')) {
      setMessage(
        'File berhasil dipilih sebagai lampiran. OCR hanya membaca foto JPG, PNG, atau WEBP.'
      );
      return;
    }

    setBusy(true);
    setProgress(0);
    setMessage('Menyiapkan pembaca bukti transaksi...');

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      // Membaca bahasa Indonesia dan Inggris.
      worker = await createWorker('ind+eng', 1, {
        logger: (info) => {
          if (info.status === 'loading tesseract core') {
            setMessage('Menyiapkan mesin OCR...');
          }

          if (info.status === 'loading language traineddata') {
            setMessage('Mengunduh data bahasa Indonesia dan Inggris...');
          }

          if (info.status === 'recognizing text') {
            setMessage('Sedang membaca bukti transaksi...');
            setProgress(Math.round(info.progress * 100));
          }
        },
      });

      const result = await worker.recognize(selectedFile);
      const extractedText = result.data.text.trim();

      if (!extractedText) {
        setMessage(
          'Teks belum berhasil dibaca. Coba gunakan foto yang lebih terang, lurus, dan tidak buram.'
        );
        return;
      }

      onTextExtracted(extractedText);
      setProgress(100);
      setMessage(
        'Pembacaan selesai. Data yang dikenali sudah dikirim ke formulir. Silakan periksa kembali.'
      );
    } catch (error: any) {
      console.error('OCR error:', error);

      setMessage(
        'OCR gagal: ' +
          (error?.message || 'Periksa koneksi internet lalu coba kembali.')
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error('Gagal menghentikan OCR worker:', error);
        }
      }

      setBusy(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] || null;

    setFile(selectedFile);
    setProgress(0);
    setMessage('');

    // File yang sama langsung dipakai sebagai lampiran transaksi.
    onFileSelected?.(selectedFile);

    if (selectedFile) {
      // OCR langsung berjalan setelah foto dipilih.
      processOCR(selectedFile);
    }
  }

  function removeFile() {
    setFile(null);
    setProgress(0);
    setMessage('');

    onFileSelected?.(null);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PEMBACA BUKTI TRANSAKSI</span>
          <h2>Scan Bukti Otomatis</h2>
        </div>
      </div>

      <p className="inline-note">
        Pilih foto bukti transfer atau nota. Sistem akan langsung mencoba
        membaca tanggal, nominal, bank, dan informasi transaksi.
      </p>

      <div className="form-field">
        <label>Pilih Foto atau PDF Bukti</label>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={busy}
          onChange={handleFileChange}
        />
      </div>

      {file && (
        <div className="data-card">
          <strong>{file.name}</strong>
          <p>
            {(file.size / 1024).toFixed(0)} KB
            {' · '}
            {file.type.startsWith('image/')
              ? 'Foto siap diproses OCR'
              : 'PDF tersimpan sebagai lampiran'}
          </p>

          <button
            type="button"
            className="delete-button"
            onClick={removeFile}
            disabled={busy}
          >
            Hapus file
          </button>
        </div>
      )}

      {busy && (
        <div style={{ margin: '15px 0' }}>
          <p className="inline-note">
            {message} {progress}%
          </p>

          <progress
            value={progress}
            max="100"
            style={{ width: '100%', height: 9 }}
          />
        </div>
      )}

      {!busy && message && (
        <p className="inline-note" role="status">
          {message}
        </p>
      )}

      {busy && (
        <button
          type="button"
          className="secondary-button"
          disabled
          style={{ width: '100%', marginTop: 12 }}
        >
          Sedang membaca bukti...
        </button>
      )}
    </section>
  );
}
