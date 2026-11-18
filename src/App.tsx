import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from './lib/supabase';
import Icon from './Icons';
import TransactionReceiptOCR from './components/TransactionReceiptOCR';
import {
  uploadTransactionReceipt,
  deleteReceipt,
  getReceiptUrl,
} from './lib/receiptStorage';
import './App.css';

type Page =
  | 'dashboard'
  | 'students'
  | 'income'
  | 'expenses'
  | 'reports'
  | 'profile';

type Student = {
  id: number;
  student_number: string | null;
  full_name: string;
  gender: 'L' | 'P' | null;
  birth_date: string | null;
  enrollment_date: string;
  status: string;
  notes: string | null;
};

type Transaction = {
  id: number;
  type: 'income' | 'expense';
  date: string;
  category: string;
  description: string | null;
  amount: number;
  student_id?: number | null;
  counterparty_name?: string | null;
  payment_method?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  reference_number?: string | null;
  receipt_url?: string | null;
  receipt_file_name?: string | null;
};

type Expense = {
  id: number;
  transaction_id: number | null;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const nav: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'students', label: 'Santri', icon: 'students' },
  { id: 'income', label: 'Uang Masuk', icon: 'payment' },
  { id: 'expenses', label: 'Uang Keluar', icon: 'expense' },
  { id: 'reports', label: 'Laporan', icon: 'report' },
  { id: 'profile', label: 'Saya', icon: 'settings' },
];

function parseDateFromOCR(text: string): string {
  const monthNames: Record<string, string> = {
    januari: '01',
    januarii: '01',
    jan: '01',
    februari: '02',
    feb: '02',
    maret: '03',
    mar: '03',
    april: '04',
    apr: '04',
    mei: '05',
    juni: '06',
    jun: '06',
    juli: '07',
    jul: '07',
    agustus: '08',
    agu: '08',
    ags: '08',
    september: '09',
    sep: '09',
    oktober: '10',
    okt: '10',
    november: '11',
    nov: '11',
    desember: '12',
    des: '12',
  };

  const numeric = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}`;
    }
  }

  const named = text.match(
    /\b(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|ags|sep|okt|nov|des)\w*\s+(20\d{2})\b/i
  );

  if (named) {
    const month = monthNames[named[2].toLowerCase()];
    if (month) {
      return `${named[3]}-${month}-${String(named[1]).padStart(2, '0')}`;
    }
  }

  return '';
}

function parseOcrAmount(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const priorityPatterns = [
    /(?:total\s+transfer|jumlah\s+transfer|nominal\s+transfer|total\s+transaksi|jumlah\s+transaksi|total\s+pembayaran|jumlah\s+pembayaran|nominal|sebesar|total)\s*[:-]?\s*(?:rp\.?\s*)?([\d.,]+)/i,
    /(?:rp\.?)\s*([\d.]{4,})/i,
  ];

  for (const pattern of priorityPatterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const digits = match[1].replace(/[^\d]/g, '');
        const amount = Number(digits);
        if (amount >= 1000 && amount <= 100000000000) {
          return String(amount);
        }
      }
    }
  }

  const candidates: number[] = [];

  for (const line of lines) {
    if (
      /referensi|reference|rekening|rek.?|no.?\s*ref|id\s*transaksi|kode|nomor|tanggal|jam|waktu|saldo|admin|biaya/i.test(
        line
      )
    ) {
      continue;
    }

    const matches =
      line.match(/(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,})/gi) || [];

    for (const item of matches) {
      const digits = item.replace(/[^\d]/g, '');
      const value = Number(digits);
      if (value >= 1000 && value <= 1000000000) candidates.push(value);
    }
  }

  if (!candidates.length) return '';
  return String(Math.max(...candidates));
}

function parseOcrReference(text: string): string {
  const patterns = [
    /(?:no.?\s*referensi|nomor\s*referensi|reference\s*number|no.?\s*ref|ref.?)\s*[:-]?\s*([A-Z0-9]{6,})/i,
    /(?:id\s*transaksi|transaction\s*id)\s*[:-]?\s*([A-Z0-9]{6,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return '';
}

function parseOcrBank(text: string): string {
  const value = text.toUpperCase();

  const banks = [
    { name: 'BRI', pattern: /\b(BRI|BRIMO)\b/ },
    { name: 'BCA', pattern: /\b(BCA|MYBCA|BCAMOBILE)\b/ },
    { name: 'MANDIRI', pattern: /\b(MANDIRI|LIVIN)\b/ },
    { name: 'SEABANK', pattern: /\b(SEABANK|SEA BANK)\b/ },
    { name: 'BNI', pattern: /\b(BNI|WONDR)\b/ },
    { name: 'BSI', pattern: /\b(BSI|BYOND)\b/ },
    { name: 'DANAMON', pattern: /\b(DANAMON)\b/ },
    { name: 'CIMB NIAGA', pattern: /\b(CIMB|OCTO)\b/ },
    { name: 'PERMATA', pattern: /\b(PERMATA)\b/ },
    { name: 'BTN', pattern: /\b(BTN)\b/ },
    { name: 'JENIUS', pattern: /\b(JENIUS)\b/ },
    { name: 'BLU', pattern: /\b(BLU BY BCA|BLU)\b/ },
    { name: 'BANK JATIM', pattern: /\b(BANK JATIM|JATIM)\b/ },
    { name: 'DANA', pattern: /\b(DANA)\b/ },
    { name: 'OVO', pattern: /\b(OVO)\b/ },
    { name: 'GOPAY', pattern: /\b(GOPAY|GO PAY)\b/ },
    { name: 'SHOPEEPAY', pattern: /\b(SHOPEEPAY|SHOPEE PAY)\b/ },
    { name: 'LINKAJA', pattern: /\b(LINKAJA|LINK AJA)\b/ },
    { name: 'QRIS', pattern: /\b(QRIS)\b/ },
  ];

  for (const bank of banks) {
    if (bank.pattern.test(value)) return bank.name;
  }

  return '';
}

function cleanOcrName(value: string): string {
  return value
    .replace(/[|{}()<>]/g, ' ')
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isOcrNameCandidate(value: string): boolean {
  const raw = value.trim();
  const name = cleanOcrName(raw);

  if (!name || name.length < 5) return false;
  if (/X{3,}/i.test(raw)) return false;
  if (/\d/.test(raw)) return false;

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;

  const excluded = [
    'BANK',
    'TRANSFER',
    'TRANSAKSI',
    'BERHASIL',
    'PEMBAYARAN',
    'SUMBER',
    'DANA',
    'TUJUAN',
    'PENERIMA',
    'PENGIRIM',
    'NOMINAL',
    'TOTAL',
    'REFERENSI',
    'REKENING',
    'SALDO',
    'BIAYA',
    'ADMIN',
    'CATATAN',
    'INFORMASI',
    'TANGGAL',
    'WAKTU',
    'JENIS',
    'BRI',
    'BCA',
    'BNI',
    'BSI',
    'MANDIRI',
    'SEABANK',
    'OVO',
    'GOPAY',
    'SHOPEEPAY',
  ];

  if (words.some((word) => excluded.includes(word))) return false;
  return true;
}

function extractOcrSectionName(text: string, labels: RegExp[]): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionEnd =
    /^(?:jenis transaksi|nominal|biaya admin|total transaksi|no.?\s*ref|reference|catatan|informasi|tanggal|waktu|status|transaksi berhasil)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const label of labels) {
      const match = line.match(label);
      if (!match) continue;

      const sameLine = line.slice(match[0].length).replace(/^[:\-\s]+/, '');

      if (sameLine && isOcrNameCandidate(sameLine)) {
        return cleanOcrName(sameLine);
      }

      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const candidate = lines[j];

        if (sectionEnd.test(candidate)) break;

        if (
          /^(?:BANK|BANK\s+BRI|BANK\s+BCA|BANK\s+MANDIRI|BANK\s+BNI|BANK\s+BSI)/i.test(
            candidate
          )
        ) {
          continue;
        }

        if (/^[Xx*\d\s.-]+$/.test(candidate)) continue;

        if (isOcrNameCandidate(candidate)) {
          return cleanOcrName(candidate);
        }
      }
    }
  }

  return '';
}

function parseOcrSender(text: string): string {
  return extractOcrSectionName(text, [
    /^\s*(?:sumber\s+dana|nama\s+pengirim|pengirim|sender|from|dari|rekening\s+asal)\s*[:-]?\s*/i,
  ]);
}

function parseOcrAccountName(text: string): string {
  return extractOcrSectionName(text, [
    /^\s*(?:tujuan|nama\s+penerima|penerima|beneficiary|recipient|account\s+name|nama\s+tujuan|rekening\s+tujuan|kepada)\s*[:-]?\s*/i,
  ]);
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage('');
    }, 1000);

    return () => clearTimeout(timer);
  }, [message]);

  const [page, setPage] = useState<Page>('dashboard');

  const [userRole, setUserRole] = useState('');
  const [fullName, setFullName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [, setExpenses] = useState<Expense[]>([]);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('semua');
  const [studentGenderFilter, setStudentGenderFilter] = useState('semua');
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentEditing, setStudentEditing] = useState<number | null>(null);

  const [studentNumber, setStudentNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentGender, setStudentGender] = useState<'L' | 'P'>('L');
  const [studentBirth, setStudentBirth] = useState('');
  const [studentEnrollment, setStudentEnrollment] = useState(today());
  const [studentStatus, setStudentStatus] = useState('aktif');
  const [studentNotes, setStudentNotes] = useState('');

  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null);
  const [expandedIncomeId, setExpandedIncomeId] = useState<number | null>(null);
  const [incomeHistorySearch, setIncomeHistorySearch] = useState('');
  const [incomeHistoryCategory, setIncomeHistoryCategory] = useState('');
  const [incomeHistoryStart, setIncomeHistoryStart] = useState('');
  const [incomeHistoryEnd, setIncomeHistoryEnd] = useState('');
  const [incomeHistoryMin, setIncomeHistoryMin] = useState('');
  const [incomeHistoryMax, setIncomeHistoryMax] = useState('');
  const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(
    null
  );
  const [receiptLoading, setReceiptLoading] = useState(false);

  const [incomeDate, setIncomeDate] = useState(today());
  const [incomeCategory, setIncomeCategory] = useState('');
  const [incomeDescription, setIncomeDescription] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeSender, setIncomeSender] = useState('');
  const [incomeMethod, setIncomeMethod] = useState('transfer');
  const [incomeBank, setIncomeBank] = useState('');
  const [incomeAccount, setIncomeAccount] = useState('');
  const [incomeReference, setIncomeReference] = useState('');
  const [incomeStudent, setIncomeStudent] = useState('');
  const [incomeStudentSearch, setIncomeStudentSearch] = useState('');
  const [showStudentOptions, setShowStudentOptions] = useState(false);
  const [incomeReceipt, setIncomeReceipt] = useState<File | null>(null);
  const [incomeOcrText, setIncomeOcrText] = useState('');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [expenseDate, setExpenseDate] = useState(today());
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseMethod, setExpenseMethod] = useState('tunai');
  const [expenseReceipt, setExpenseReceipt] = useState<File | null>(null);
  const [expenseOcrText, setExpenseOcrText] = useState('');

  const [reportStart, setReportStart] = useState(
    `${today().slice(0, 4)}-01-01`
  );
  const [reportEnd, setReportEnd] = useState(today());

  const [profileSection, setProfileSection] = useState('overview');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pondokName, setPondokName] = useState(
    'Pondok Pesantren Nur Qomaril Wujud'
  );
  const [themeMode, setThemeMode] = useState('glass');

  const canManage = userRole === 'admin' || userRole === 'bendahara';
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setStudents([]);
      setTransactions([]);
      setExpenses([]);
      setUserRole('');
      setFullName('');
      return;
    }
    refreshAll();
  }, [user]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    setUserRole(data?.role || '');
    setFullName(data?.full_name || '');
    setProfileName(data?.full_name || '');
  }

  async function loadStudents() {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('full_name');

    if (error) throw error;
    setStudents((data || []) as Student[]);
  }

  async function loadTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (error) throw error;
    setTransactions((data || []) as Transaction[]);
  }

  async function loadExpenses() {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false });

    if (error) throw error;
    setExpenses((data || []) as Expense[]);
  }

  async function refreshAll() {
    setBusy(true);
    try {
      await Promise.all([
        loadProfile(),
        loadStudents(),
        loadTransactions(),
        loadExpenses(),
      ]);
    } catch (error: any) {
      setMessage('Gagal memuat data: ' + error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage(
          data.session
            ? 'Akun berhasil dibuat. Pastikan peran akun sudah disiapkan admin.'
            : 'Pendaftaran berhasil. Periksa email untuk konfirmasi.'
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage(
        (isRegister ? 'Pendaftaran gagal: ' : 'Login gagal: ') + error.message
      );
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setMessage(
        'Masukkan email terlebih dahulu untuk menerima tautan reset password.'
      );
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);

    setMessage(
      error
        ? 'Gagal mengirim tautan reset: ' + error.message
        : 'Tautan reset password telah diminta. Periksa email kamu.'
    );
  }

  async function updatePassword(e: FormEvent) {
    e.preventDefault();

    if (newPassword.length < 6) {
      setMessage('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Konfirmasi password tidak sama.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

    if (error) {
      setMessage('Gagal mengubah password: ' + error.message);
    } else {
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password berhasil diperbarui.');
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();

    if (!profileName.trim()) {
      setMessage('Nama pengguna wajib diisi.');
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: profileName.trim() })
      .eq('id', user.id);
    setBusy(false);

    if (error) {
      setMessage('Gagal menyimpan profil: ' + error.message);
    } else {
      setFullName(profileName.trim());
      setMessage('Profil berhasil diperbarui.');
    }
  }

  function resetStudent() {
    setStudentEditing(null);
    setStudentNumber('');
    setStudentName('');
    setStudentGender('L');
    setStudentBirth('');
    setStudentEnrollment(today());
    setStudentStatus('aktif');
    setStudentNotes('');
    setShowStudentForm(false);
  }

  function editStudent(s: Student) {
    setStudentEditing(s.id);
    setStudentNumber(s.student_number || '');
    setStudentName(s.full_name);
    setStudentGender(s.gender || 'L');
    setStudentBirth(s.birth_date || '');
    setStudentEnrollment(s.enrollment_date);
    setStudentStatus(s.status);
    setStudentNotes(s.notes || '');
    setShowStudentForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveStudent(e: FormEvent) {
    e.preventDefault();

    if (!canManage) {
      setMessage('Akses tidak diizinkan.');
      return;
    }
    if (!studentName.trim()) {
      setMessage('Nama santri wajib diisi.');
      return;
    }

    setBusy(true);

    const payload = {
      student_number: studentNumber.trim() || null,
      full_name: studentName.trim(),
      gender: studentGender,
      birth_date: studentBirth || null,
      enrollment_date: studentEnrollment,
      status: studentStatus,
      notes: studentNotes.trim() || null,
    };

    const result = studentEditing
      ? await supabase.from('students').update(payload).eq('id', studentEditing)
      : await supabase.from('students').insert(payload);

    setBusy(false);

    if (result.error) {
      setMessage('Gagal menyimpan santri: ' + result.error.message);
      return;
    }

    resetStudent();
    setMessage('Data santri berhasil disimpan.');
    await loadStudents();
  }

  async function archiveStudent(s: Student) {
    if (!canManage) return;
    if (!window.confirm(`Nonaktifkan ${s.full_name}?`)) return;

    const { error } = await supabase
      .from('students')
      .update({ status: 'nonaktif' })
      .eq('id', s.id);

    if (error) setMessage('Gagal mengubah status: ' + error.message);
    else {
      setMessage('Status santri berhasil dinonaktifkan.');
      await loadStudents();
    }
  }

  async function deleteStudent(s: Student) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Hapus permanen data ${s.full_name}? Data tidak dapat dikembalikan.`
      )
    )
      return;

    setBusy(true);
    const { error } = await supabase.from('students').delete().eq('id', s.id);
    setBusy(false);

    if (error) {
      setMessage(
        'Tidak dapat menghapus data. Mungkin masih memiliki data terkait: ' +
          error.message
      );
      return;
    }

    if (studentEditing === s.id) resetStudent();
    setMessage('Data santri berhasil dihapus.');
    await loadStudents();
  }

  async function openTransactionReceipt(filePath: string) {
    if (!filePath) {
      setMessage('Bukti transaksi tidak ditemukan.');
      return;
    }

    setReceiptLoading(true);

    try {
      const url = await getReceiptUrl(filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      setMessage(
        'Gagal membuka bukti: ' + (error.message || 'Terjadi kesalahan.')
      );
    } finally {
      setReceiptLoading(false);
    }
  }

  function startEditIncome(t: Transaction) {
    setEditingIncomeId(t.id);
    setIncomeDate(t.date);
    setIncomeCategory(t.category);
    setIncomeDescription(t.description || '');
    setIncomeAmount(String(t.amount));
    setIncomeSender(t.counterparty_name || '');
    setIncomeMethod(t.payment_method || 'transfer');
    setIncomeBank(t.bank_name || '');
    setIncomeAccount(t.account_name || '');
    setIncomeReference(t.reference_number || '');
    setIncomeStudent(t.student_id ? String(t.student_id) : '');
    setIncomeStudentSearch('');
    setIncomeReceipt(null);
    setIncomeOcrText('');
    setShowStudentOptions(false);
    setShowIncomeForm(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function resetIncomeForm() {
    setEditingIncomeId(null);
    setIncomeDate(today());
    setIncomeCategory('');
    setIncomeDescription('');
    setIncomeAmount('');
    setIncomeSender('');
    setIncomeMethod('transfer');
    setIncomeBank('');
    setIncomeAccount('');
    setIncomeReference('');
    setIncomeStudent('');
    setIncomeStudentSearch('');
    setIncomeReceipt(null);
    setIncomeOcrText('');
    setShowStudentOptions(false);
    setShowIncomeForm(false);
  }

  function startEditExpense(t: Transaction) {
    setEditingExpenseId(t.id);
    setExpenseDate(t.date);
    setExpenseCategory(t.category);
    setExpenseDescription(t.description || '');
    setExpenseAmount(String(t.amount));
    setExpensePayee(t.counterparty_name || '');
    setExpenseMethod(t.payment_method || 'tunai');
    setExpenseReceipt(null);
    setExpenseOcrText('');
    setShowExpenseForm(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function resetExpenseForm() {
    setEditingExpenseId(null);
    setExpenseDate(today());
    setExpenseCategory('');
    setExpenseDescription('');
    setExpenseAmount('');
    setExpensePayee('');
    setExpenseMethod('tunai');
    setExpenseReceipt(null);
    setExpenseOcrText('');
    setShowExpenseForm(false);
  }

  function handleIncomeOCR(text: string) {
    setIncomeOcrText(text);

    const amount = parseOcrAmount(text);
    const date = parseDateFromOCR(text);
    const bank = parseOcrBank(text);
    const sender = parseOcrSender(text);
    const accountName = parseOcrAccountName(text);
    const reference = parseOcrReference(text);

    if (amount) setIncomeAmount(amount);
    if (date) setIncomeDate(date);
    if (bank) setIncomeBank(bank);
    if (sender) setIncomeSender(sender);
    if (accountName) setIncomeAccount(accountName);
    if (reference) setIncomeReference(reference);

    setMessage(
      `OCR selesai. ${
        amount ? 'Nominal terbaca. ' : 'Nominal belum dikenali. '
      }${date ? 'Tanggal terbaca. ' : ''}${
        bank ? `Bank terdeteksi: ${bank}. ` : 'Bank belum dikenali. '
      }${
        sender
          ? 'Nama pengirim terbaca. '
          : 'Nama pengirim tidak tersedia atau tidak terbaca. '
      }${
        accountName
          ? 'Nama penerima terbaca. '
          : 'Nama penerima tidak tersedia atau tidak terbaca. '
      }Periksa kembali hasil sebelum menyimpan.`
    );
  }

  function handleExpenseOCR(text: string) {
    setExpenseOcrText(text);
    const amount = parseOcrAmount(text);
    const date = parseDateFromOCR(text);
    if (amount) setExpenseAmount(amount);
    if (date) setExpenseDate(date);
    setMessage(
      amount
        ? 'OCR selesai. Nominal terisi, periksa kembali sebelum menyimpan.'
        : 'OCR selesai, tetapi nominal belum dikenali. Silakan isi manual.'
    );
  }

  async function saveIncome(e: FormEvent) {
    e.preventDefault();

    if (!canManage) {
      setMessage('Akses tidak diizinkan.');
      return;
    }

    if (!incomeDate) {
      setMessage('Tanggal pemasukan wajib diisi.');

      setTimeout(() => {
        const dateField = document.getElementById('income-date');
        dateField?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        dateField?.focus({ preventScroll: true });
      }, 300);

      return;
    }

    if (!incomeCategory.trim()) {
      setMessage(
        'Kategori pemasukan belum dipilih. Silakan pilih kategori terlebih dahulu.'
      );

      setTimeout(() => {
        const categoryField = document.getElementById('income-category');
        categoryField?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        categoryField?.focus({ preventScroll: true });
      }, 300);

      return;
    }

    const amount = Number(incomeAmount);

    if (!incomeAmount || !Number.isFinite(amount) || amount <= 0) {
      setMessage('Nominal wajib diisi dan harus lebih dari Rp0.');

      setTimeout(() => {
        const amountField = document.getElementById('income-amount');
        amountField?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        amountField?.focus({ preventScroll: true });
      }, 300);

      return;
    }

    // Semua kategori pemasukan wajib terhubung dengan santri aktif.
    if (!incomeStudent) {
      setMessage(
        'Data belum lengkap. Silakan pilih nama santri terkait terlebih dahulu.'
      );

      setShowStudentOptions(true);
      setIncomeStudentSearch('');

      setTimeout(() => {
        const studentField = document.getElementById('income-student');

        if (studentField) {
          studentField.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          studentField.focus({ preventScroll: true });
        }
      }, 300);

      return;
    }

    const selectedStudent = students.find(
      (s) => String(s.id) === incomeStudent
    );

    if (!selectedStudent) {
      setMessage('Santri tidak ditemukan. Silakan pilih ulang.');
      return;
    }

    if (selectedStudent.status !== 'aktif') {
      setMessage(
        'Santri yang dipilih tidak berstatus aktif. Periksa kembali data santri.'
      );
      return;
    }

    const senderLabelExists =
      /sumber\s+dana|nama\s+pengirim|pengirim|sender|from|dari\s*[:-]/i.test(
        incomeOcrText
      );

    if (incomeReceipt && senderLabelExists && !incomeSender.trim()) {
      setMessage(
        'Nama pengirim belum diisi. Silakan lengkapi nama pengirim sesuai bukti transaksi.'
      );

      setTimeout(() => {
        const senderField = document.getElementById('income-sender');
        senderField?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        senderField?.focus({ preventScroll: true });
      }, 300);

      return;
    }

    setBusy(true);
    setMessage('');

    let receiptPath = '';

    try {
      if (incomeReceipt) {
        receiptPath = await uploadTransactionReceipt('income', incomeReceipt);
      }

      const oldIncome = editingIncomeId
        ? transactions.find((t) => t.id === editingIncomeId)
        : undefined;

      const transactionData = {
        type: 'income' as const,
        date: incomeDate,
        category: incomeCategory.trim(),
        description: incomeDescription.trim() || incomeCategory.trim(),
        amount,
        student_id: Number(incomeStudent),
        counterparty_name: incomeSender.trim() || null,
        payment_method: incomeMethod,
        bank_name: incomeBank.trim() || null,
        account_name: incomeAccount.trim() || null,
        reference_number: incomeReference.trim() || null,
        receipt_url: receiptPath || oldIncome?.receipt_url || null,
        receipt_file_name:
          incomeReceipt?.name || oldIncome?.receipt_file_name || null,
      };

      if (editingIncomeId) {
        const { error } = await supabase
          .from('transactions')
          .update(transactionData)
          .eq('id', editingIncomeId)
          .eq('type', 'income');

        if (error) throw error;

        if (receiptPath && oldIncome?.receipt_url) {
          await deleteReceipt(oldIncome.receipt_url).catch(() => {});
        }
      } else {
        const { error } = await supabase.from('transactions').insert({
          ...transactionData,
          created_by: user.id,
        });

        if (error) throw error;
      }

      resetIncomeForm();
      await refreshAll();

      setMessage(
        editingIncomeId
          ? '✓ Transaksi uang masuk berhasil diperbarui!'
          : '✓ Transaksi berhasil disimpan! Data uang masuk telah tercatat.'
      );
    } catch (error: any) {
      if (receiptPath) {
        await deleteReceipt(receiptPath).catch(() => {});
      }

      setMessage(
        'Gagal menyimpan uang masuk: ' + (error.message || 'Terjadi kesalahan.')
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteIncome(t: Transaction) {
    if (!canManage) {
      setMessage('Akses tidak diizinkan.');
      return;
    }

    const confirmed = window.confirm(
      `Yakin ingin menghapus transaksi ${t.category} sebesar ${rupiah(
        t.amount
      )}? Tindakan ini tidak dapat dibatalkan.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', t.id)
        .eq('type', 'income');

      if (error) throw error;

      if (t.receipt_url) {
        await deleteReceipt(t.receipt_url).catch(() => {});
      }

      await refreshAll();
      setMessage('Transaksi uang masuk berhasil dihapus.');
    } catch (error: any) {
      setMessage(
        'Gagal menghapus transaksi: ' + (error.message || 'Terjadi kesalahan.')
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(t: Transaction) {
    if (!canManage) {
      setMessage('Akses tidak diizinkan.');
      return;
    }

    const confirmed = window.confirm(
      `Yakin ingin menghapus pengeluaran ${t.category} sebesar ${rupiah(
        t.amount
      )}? Tindakan ini tidak dapat dibatalkan.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage('');

    try {
      const { error: expenseError } = await supabase
        .from('expenses')
        .delete()
        .eq('transaction_id', t.id);

      if (expenseError) throw expenseError;

      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', t.id)
        .eq('type', 'expense');

      if (transactionError) throw transactionError;

      if (t.receipt_url) {
        await deleteReceipt(t.receipt_url).catch(() => {});
      }

      await refreshAll();
      setMessage('Transaksi uang keluar berhasil dihapus.');
    } catch (error: any) {
      setMessage(
        'Gagal menghapus uang keluar: ' +
          (error.message || 'Terjadi kesalahan.')
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveExpense(e: FormEvent) {
    e.preventDefault();

    if (!canManage) {
      setMessage('Akses tidak diizinkan.');
      return;
    }

    if (!expenseDate) {
      setMessage('Tanggal pengeluaran wajib diisi.');
      setTimeout(() => {
        const field = document.getElementById('expense-date');
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus({ preventScroll: true });
      }, 300);
      return;
    }

    if (!expenseCategory.trim()) {
      setMessage('Kategori pengeluaran wajib diisi.');
      setTimeout(() => {
        const field = document.getElementById('expenseCategory');
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus({ preventScroll: true });
      }, 300);
      return;
    }

    const amount = Number(expenseAmount);

    if (!expenseAmount || !Number.isFinite(amount) || amount <= 0) {
      setMessage('Nominal pengeluaran wajib diisi dan harus lebih dari Rp0.');
      setTimeout(() => {
        const field = document.getElementById('expense-amount');
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus({ preventScroll: true });
      }, 300);
      return;
    }

    setBusy(true);
    setMessage('');

    let receiptPath = '';

    try {
      if (expenseReceipt) {
        receiptPath = await uploadTransactionReceipt('expense', expenseReceipt);
      }

      const oldExpenseTransaction = editingExpenseId
        ? transactions.find((t) => t.id === editingExpenseId)
        : undefined;

      const transactionData = {
        type: 'expense' as const,
        date: expenseDate,
        category: expenseCategory.trim(),
        description: expenseDescription.trim() || expenseCategory.trim(),
        amount,
        counterparty_name: expensePayee.trim() || null,
        payment_method: expenseMethod,
        receipt_url: receiptPath || oldExpenseTransaction?.receipt_url || null,
        receipt_file_name:
          expenseReceipt?.name ||
          oldExpenseTransaction?.receipt_file_name ||
          null,
      };

      if (editingExpenseId) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .update(transactionData)
          .eq('id', editingExpenseId)
          .eq('type', 'expense');

        if (transactionError) throw transactionError;

        const { error: expenseError } = await supabase
          .from('expenses')
          .update({
            expense_date: expenseDate,
            category: expenseCategory.trim(),
            description: expenseDescription.trim() || '-',
            amount,
          })
          .eq('transaction_id', editingExpenseId);

        if (expenseError) throw expenseError;

        if (receiptPath && oldExpenseTransaction?.receipt_url) {
          await deleteReceipt(oldExpenseTransaction.receipt_url).catch(
            () => {}
          );
        }
      } else {
        const { data: transaction, error: transactionError } = await supabase
          .from('transactions')
          .insert({
            ...transactionData,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (transactionError) throw transactionError;

        const { error: expenseError } = await supabase.from('expenses').insert({
          transaction_id: transaction.id,
          expense_date: expenseDate,
          category: expenseCategory.trim(),
          description: expenseDescription.trim() || '-',
          amount,
          created_by: user.id,
        });

        if (expenseError) {
          await supabase.from('transactions').delete().eq('id', transaction.id);
          throw expenseError;
        }
      }

      resetExpenseForm();
      await refreshAll();

      setMessage(
        editingExpenseId
          ? '✓ Transaksi uang keluar berhasil diperbarui!'
          : '✓ Transaksi uang keluar berhasil disimpan!'
      );
    } catch (error: any) {
      if (receiptPath) {
        await deleteReceipt(receiptPath).catch(() => {});
      }

      setMessage(
        'Gagal menyimpan uang keluar: ' +
          (error.message || 'Terjadi kesalahan.')
      );
    } finally {
      setBusy(false);
    }
  }

  const filteredStudents = useMemo(() => {
    const q = studentSearch.toLowerCase().trim();

    return students.filter((s) => {
      const searchMatch =
        s.full_name.toLowerCase().includes(q) ||
        (s.student_number || '').toLowerCase().includes(q);
      const statusMatch =
        studentFilter === 'semua' || s.status === studentFilter;
      const genderMatch =
        studentGenderFilter === 'semua' || s.gender === studentGenderFilter;

      return searchMatch && statusMatch && genderMatch;
    });
  }, [students, studentSearch, studentFilter, studentGenderFilter]);

  const incomeStudentResults = useMemo(() => {
    const q = incomeStudentSearch.toLowerCase().trim();

    return students
      .filter((s) => s.status === 'aktif')
      .filter((s) => !q || s.full_name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [students, incomeStudentSearch]);

  const selectedIncomeStudent = students.find(
    (s) => String(s.id) === incomeStudent
  );

  const filteredIncomeHistory = useMemo(() => {
    return transactions.filter((t) => {
      if (t.type !== 'income') return false;

      const query = incomeHistorySearch.toLowerCase().trim();
      const studentName =
        students.find((s) => String(s.id) === String(t.student_id))
          ?.full_name || '';

      const searchMatch =
        !query ||
        t.category.toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query) ||
        (t.counterparty_name || '').toLowerCase().includes(query) ||
        studentName.toLowerCase().includes(query) ||
        String(t.reference_number || '')
          .toLowerCase()
          .includes(query);

      const categoryMatch =
        !incomeHistoryCategory || t.category === incomeHistoryCategory;
      const startMatch = !incomeHistoryStart || t.date >= incomeHistoryStart;
      const endMatch = !incomeHistoryEnd || t.date <= incomeHistoryEnd;
      const minMatch =
        incomeHistoryMin === '' || Number(t.amount) >= Number(incomeHistoryMin);
      const maxMatch =
        incomeHistoryMax === '' || Number(t.amount) <= Number(incomeHistoryMax);

      return (
        searchMatch &&
        categoryMatch &&
        startMatch &&
        endMatch &&
        minMatch &&
        maxMatch
      );
    });
  }, [
    transactions,
    students,
    incomeHistorySearch,
    incomeHistoryCategory,
    incomeHistoryStart,
    incomeHistoryEnd,
    incomeHistoryMin,
    incomeHistoryMax,
  ]);

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balance = totalIncome - totalExpense;
  const activeStudents = students.filter((s) => s.status === 'aktif').length;

  const reportTransactions = transactions.filter(
    (t) => t.date >= reportStart && t.date <= reportEnd
  );

  const reportIncome = reportTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const reportExpense = reportTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  function downloadReport() {
    const rows = [
      ['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal'],
      ...reportTransactions.map((t) => [
        t.date,
        t.type === 'income' ? 'Uang Masuk' : 'Uang Keluar',
        t.category,
        t.description || '',
        String(t.amount),
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-keuangan-${reportStart}-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="loading-screen">Memuat aplikasi...</div>;
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">Logo Pondok</div>
          <p className="eyebrow">PONDOK PESANTREN SALAFIYAH</p>
          <h1>NUR QOMARIL WUJUD</h1>
          <p>Sistem Administrasi Keuangan Pondok Pesantren</p>

          <h2>{isRegister ? 'Daftar Akun' : 'Selamat Datang'}</h2>

          <form onSubmit={handleAuth}>
            <label>Email</label>
            <input
              type="email"
              placeholder="Masukkan email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label>Password</label>
            <div className="password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="button"
                className="text-button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Sembunyikan' : 'Lihat'}
              </button>
            </div>

            <button className="primary-button" type="submit" disabled={busy}>
              {busy
                ? 'Memproses...'
                : isRegister
                ? 'Daftar Sekarang'
                : 'Masuk ke Aplikasi'}
            </button>
          </form>

          {!isRegister && (
            <button
              type="button"
              className="text-button"
              onClick={forgotPassword}
              disabled={busy}
            >
              Lupa password?
            </button>
          )}

          {message && <p className="message">{message}</p>}

          <p className="switch-auth">
            {isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setIsRegister(!isRegister);
                setMessage('');
              }}
            >
              {isRegister ? 'Login' : 'Daftar'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell theme-${themeMode}`}>
      <header className="top-header">
        <div>
          <span className="eyebrow">SISTEM ADMINISTRASI PONDOK</span>
          <h1>{pondokName.replace('Pondok Pesantren ', '')}</h1>
        </div>
      </header>

      <main className="dashboard">
        {page === 'dashboard' && (
          <>
            <section className="hero-panel">
              <span>ASSALAMU'ALAIKUM WARAHMATULLAHI WABARAKATUH</span>
              <h1>Selamat Datang, {fullName || 'Pengguna'}!</h1>
              <p>
                Pusat pengelolaan administrasi dan keuangan Pondok Pesantren Nur
                Qomaril Wujud.
              </p>
            </section>

            <div className="section-heading">
              <div>
                <span className="eyebrow">RINGKASAN KEUANGAN</span>
                <h2>Ikhtisar Keuangan</h2>
              </div>
              <button
                className="secondary-button"
                onClick={refreshAll}
                disabled={busy}
              >
                <Icon name="refresh" size={15} />
                {busy ? 'Memuat...' : 'Refresh'}
              </button>
            </div>

            <section className="summary-grid">
              <div className="summary-card balance-card">
                <span>Saldo Pembukuan</span>
                <strong>{rupiah(balance)}</strong>
                <small>Pemasukan dikurangi pengeluaran</small>
              </div>
              <div className="summary-card">
                <span>Total Uang Masuk</span>
                <strong>{rupiah(totalIncome)}</strong>
                <small>Akumulasi seluruh pemasukan</small>
              </div>
              <div className="summary-card">
                <span>Total Uang Keluar</span>
                <strong>{rupiah(totalExpense)}</strong>
                <small>Akumulasi seluruh pengeluaran</small>
              </div>
              <div className="summary-card">
                <span>Santri Aktif</span>
                <strong>{activeStudents}</strong>
                <small>Dari {students.length} data santri</small>
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AKTIVITAS</span>
                  <h2>Transaksi Terbaru</h2>
                </div>
              </div>

              {transactions.slice(0, 8).map((t) => (
                <div className="data-card" key={t.id}>
                  <h3>{t.category}</h3>
                  <p>
                    {formatDate(t.date)} ·{' '}
                    {t.description || t.counterparty_name || 'Tanpa keterangan'}
                  </p>
                  <strong className={t.type === 'income' ? 'green' : 'red'}>
                    {t.type === 'income' ? '+' : '-'} {rupiah(t.amount)}
                  </strong>
                </div>
              ))}

              {transactions.length === 0 && (
                <p className="empty">Belum ada transaksi.</p>
              )}
            </section>
          </>
        )}

        {page === 'students' && (
          <>
            <section className="page-intro">
              <span className="eyebrow">ADMINISTRASI SANTRI</span>
              <h1>Data Santri</h1>
              <p>Kelola identitas, jenis kelamin, dan status santri pondok.</p>
            </section>

            {canManage && !showStudentForm && (
              <button
                className="primary-button"
                style={{ width: '100%', marginBottom: 16 }}
                onClick={() => {
                  resetStudent();
                  setShowStudentForm(true);
                }}
              >
                <Icon name="plus" size={16} /> Tambah Santri
              </button>
            )}

            {canManage && showStudentForm && (
              <section className="panel">
                <div className="section-heading">
                  <h2>{studentEditing ? 'Edit Santri' : 'Tambah Santri'}</h2>
                </div>

                <form onSubmit={saveStudent} className="form-grid">
                  <div className="form-field">
                    <label>Nomor Induk Santri (Opsional)</label>
                    <input
                      value={studentNumber}
                      onChange={(e) => setStudentNumber(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Nama Lengkap</label>
                    <input
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Jenis Kelamin</label>
                    <select
                      value={studentGender}
                      onChange={(e) =>
                        setStudentGender(e.target.value as 'L' | 'P')
                      }
                    >
                      <option value="L">Banin</option>
                      <option value="P">Banat</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Tanggal Lahir</label>
                    <input
                      type="date"
                      value={studentBirth}
                      onChange={(e) => setStudentBirth(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Tanggal Masuk</label>
                    <input
                      type="date"
                      value={studentEnrollment}
                      onChange={(e) => setStudentEnrollment(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select
                      value={studentStatus}
                      onChange={(e) => setStudentStatus(e.target.value)}
                    >
                      <option value="aktif">Aktif</option>
                      <option value="nonaktif">Nonaktif</option>
                      <option value="lulus">Lulus</option>
                      <option value="keluar">Keluar</option>
                    </select>
                  </div>
                  <div className="form-field full-field">
                    <label>Catatan</label>
                    <textarea
                      rows={3}
                      value={studentNotes}
                      onChange={(e) => setStudentNotes(e.target.value)}
                    />
                  </div>
                  <div className="form-actions full-field">
                    <button className="primary-button" disabled={busy}>
                      <Icon name="check" size={15} />{' '}
                      {busy ? 'Menyimpan...' : 'Simpan Santri'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={resetStudent}
                    >
                      Batal
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="section-heading">
                <h2>Daftar Santri ({filteredStudents.length})</h2>
                <button className="secondary-button" onClick={loadStudents}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>

              <div className="student-tools">
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Cari nama atau nomor santri..."
                />
                <select
                  value={studentGenderFilter}
                  onChange={(e) => setStudentGenderFilter(e.target.value)}
                >
                  <option value="semua">Banin dan Banat</option>
                  <option value="L">Banin</option>
                  <option value="P">Banat</option>
                </select>
                <select
                  value={studentFilter}
                  onChange={(e) => setStudentFilter(e.target.value)}
                >
                  <option value="semua">Semua Status</option>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                  <option value="lulus">Lulus</option>
                  <option value="keluar">Keluar</option>
                </select>
              </div>

              {filteredStudents.map((s) => (
                <div className="data-card" key={s.id}>
                  <h3>{s.full_name}</h3>
                  <p>
                    {s.gender === 'L'
                      ? 'Banin'
                      : s.gender === 'P'
                      ? 'Banat'
                      : 'Jenis kelamin belum diisi'}
                  </p>
                  <p>
                    Masuk: {formatDate(s.enrollment_date)} ·{' '}
                    <span className={`status-badge status-${s.status}`}>
                      {s.status}
                    </span>
                  </p>
                  {s.notes && <p>{s.notes}</p>}
                  {canManage && (
                    <div className="data-card-actions">
                      <button
                        className="edit-button"
                        onClick={() => editStudent(s)}
                      >
                        <Icon name="edit" size={14} /> Edit
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => archiveStudent(s)}
                      >
                        Nonaktifkan
                      </button>
                      <button
                        className="delete-button"
                        disabled={busy}
                        onClick={() => deleteStudent(s)}
                      >
                        <Icon name="trash" size={14} /> Hapus
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {filteredStudents.length === 0 && (
                <p className="empty">Tidak ada data santri.</p>
              )}
            </section>
          </>
        )}

        {page === 'income' && (
          <>
            <section className="page-intro">
              <span className="eyebrow">PENERIMAAN DANA PONDOK</span>
              <h1>Uang Masuk</h1>
              <p>
                Catat pemasukan manual atau gunakan OCR dari bukti transfer.
              </p>
            </section>

            {canManage && !showIncomeForm && (
              <button
                className="primary-button"
                style={{ width: '100%', marginBottom: 16 }}
                onClick={() => setShowIncomeForm(true)}
              >
                <Icon name="plus" size={16} /> Catat Uang Masuk
              </button>
            )}

            {canManage && showIncomeForm && (
              <section className="panel">
                <div className="section-heading">
                  <h2>Formulir Uang Masuk</h2>
                </div>

                <TransactionReceiptOCR
                  onTextExtracted={handleIncomeOCR}
                  onFileSelected={setIncomeReceipt}
                />

                <form onSubmit={saveIncome} className="form-grid">
                  <div className="form-field">
                    <label>Tanggal Pemasukan</label>
                    <input
                      id="income-date"
                      type="date"
                      value={incomeDate}
                      onChange={(e) => setIncomeDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Kategori Pemasukan</label>
                    <select
                      id="income-category"
                      value={incomeCategory}
                      onChange={(e) => setIncomeCategory(e.target.value)}
                      required
                    >
                      <option value="">-- Pilih Kategori Pemasukan --</option>
                      <option value="Pembayaran Santri">
                        Pembayaran Santri
                      </option>
                      <option value="Donasi">Donasi</option>
                      <option value="Infaq">Infaq</option>
                      <option value="Wakaf">Wakaf</option>
                      <option value="Sumbangan">Sumbangan</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Nama Pengirim</label>
                    <input
                      id="income-sender"
                      value={incomeSender}
                      onChange={(e) => setIncomeSender(e.target.value)}
                      placeholder="Nama pengirim dana"
                    />
                  </div>

                  <div className="form-field">
                    <label>Nominal (Rp)</label>
                    <input
                      id="income-amount"
                      type="number"
                      min="1"
                      value={incomeAmount}
                      onChange={(e) => setIncomeAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Metode Penerimaan</label>
                    <select
                      value={incomeMethod}
                      onChange={(e) => setIncomeMethod(e.target.value)}
                    >
                      <option value="transfer">Transfer</option>
                      <option value="tunai">Tunai</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Bank Asal</label>
                    <input
                      value={incomeBank}
                      onChange={(e) => setIncomeBank(e.target.value)}
                      placeholder="Contoh: BRI"
                    />
                  </div>

                  <div className="form-field">
                    <label>Nama Pemilik Rekening</label>
                    <input
                      value={incomeAccount}
                      onChange={(e) => setIncomeAccount(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Nomor Referensi</label>
                    <input
                      value={incomeReference}
                      onChange={(e) => setIncomeReference(e.target.value)}
                    />
                  </div>

                  <div className="form-field full-field">
                    <label>Santri Terkait (Wajib Dipilih)</label>
                    <input
                      id="income-student"
                      value={
                        incomeStudent
                          ? selectedIncomeStudent?.full_name || ''
                          : incomeStudentSearch
                      }
                      onFocus={() => {
                        setShowStudentOptions(true);
                        setIncomeStudentSearch('');
                      }}
                      onChange={(e) => {
                        setIncomeStudent('');
                        setIncomeStudentSearch(e.target.value);
                        setShowStudentOptions(true);
                      }}
                      placeholder="Ketik nama santri untuk mencari..."
                      autoComplete="off"
                    />

                    {incomeStudent && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setIncomeStudent('');
                          setIncomeStudentSearch('');
                          setShowStudentOptions(false);
                        }}
                      >
                        Hapus pilihan
                      </button>
                    )}

                    {showStudentOptions && (
                      <div className="student-options">
                        {incomeStudentResults.length > 0 ? (
                          incomeStudentResults.slice(0, 5).map((s) => (
                            <button
                              type="button"
                              className="student-option"
                              key={s.id}
                              onClick={() => {
                                setIncomeStudent(String(s.id));
                                setIncomeStudentSearch('');
                                setShowStudentOptions(false);
                              }}
                            >
                              <strong>{s.full_name}</strong>
                              <small>
                                {s.gender === 'L' ? 'Banin' : 'Banat'} · Aktif
                              </small>
                            </button>
                          ))
                        ) : (
                          <p className="empty">Santri tidak ditemukan.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <label>Bukti Transfer (Opsional)</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) =>
                        setIncomeReceipt(e.target.files?.[0] || null)
                      }
                    />
                    <small className="inline-note">Maksimal 5 MB.</small>
                  </div>

                  <div className="form-field full-field">
                    <label>Keterangan</label>
                    <textarea
                      rows={2}
                      value={incomeDescription}
                      onChange={(e) => setIncomeDescription(e.target.value)}
                    />
                  </div>

                  {incomeOcrText && (
                    <div className="form-field full-field">
                      <label>Hasil teks OCR</label>
                      <textarea rows={4} value={incomeOcrText} readOnly />
                      <small className="inline-note">
                        Hasil OCR bisa keliru. Cocokkan dengan bukti asli
                        sebelum menyimpan.
                      </small>
                    </div>
                  )}

                  <div className="form-actions full-field">
                    <button className="primary-button" disabled={busy}>
                      <Icon name="check" size={15} />{' '}
                      {busy ? 'Menyimpan...' : 'Simpan Uang Masuk'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={resetIncomeForm}
                    >
                      Batal
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="section-heading">
                <h2>Riwayat Uang Masuk</h2>
                <button className="secondary-button" onClick={loadTransactions}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>

              <div className="history-filters">
                <input
                  type="text"
                  placeholder="Cari santri, pengirim, keterangan..."
                  value={incomeHistorySearch}
                  onChange={(e) => setIncomeHistorySearch(e.target.value)}
                />

                {incomeHistorySearch.trim() && (
                  <div className="search-feedback">
                    {filteredIncomeHistory.length > 0 ? (
                      <>
                        ✓ Ditemukan{' '}
                        <strong>
                          {filteredIncomeHistory.length} transaksi
                        </strong>{' '}
                        yang cocok dengan "{incomeHistorySearch}"
                      </>
                    ) : (
                      <>
                        Tidak ada transaksi yang cocok dengan "
                        {incomeHistorySearch}"
                      </>
                    )}
                  </div>
                )}

                <select
                  value={incomeHistoryCategory}
                  onChange={(e) => setIncomeHistoryCategory(e.target.value)}
                >
                  <option value="">Semua Kategori</option>
                  <option value="Pembayaran Santri">Pembayaran Santri</option>
                  <option value="Donasi">Donasi</option>
                  <option value="Infaq">Infaq</option>
                  <option value="Wakaf">Wakaf</option>
                  <option value="Sumbangan">Sumbangan</option>
                  <option value="Lainnya">Lainnya</option>
                </select>

                <div className="filter-date-row">
                  <div>
                    <label>Dari Tanggal</label>
                    <input
                      type="date"
                      value={incomeHistoryStart}
                      onChange={(e) => setIncomeHistoryStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Sampai Tanggal</label>
                    <input
                      type="date"
                      value={incomeHistoryEnd}
                      onChange={(e) => setIncomeHistoryEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-amount-grid">
                  <div className="filter-input-group">
                    <label>Nominal Minimum</label>
                    <div className="filter-currency-input">
                      <span>Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Minimal"
                        value={
                          incomeHistoryMin
                            ? Number(incomeHistoryMin).toLocaleString('id-ID')
                            : ''
                        }
                        onChange={(e) =>
                          setIncomeHistoryMin(e.target.value.replace(/\D/g, ''))
                        }
                      />
                    </div>
                  </div>

                  <div className="filter-input-group">
                    <label>Nominal Maksimum</label>
                    <div className="filter-currency-input">
                      <span>Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Maksimal"
                        value={
                          incomeHistoryMax
                            ? Number(incomeHistoryMax).toLocaleString('id-ID')
                            : ''
                        }
                        onChange={(e) =>
                          setIncomeHistoryMax(e.target.value.replace(/\D/g, ''))
                        }
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="filter-reset-button"
                  onClick={() => {
                    setIncomeHistorySearch('');
                    setIncomeHistoryCategory('');
                    setIncomeHistoryStart('');
                    setIncomeHistoryEnd('');
                    setIncomeHistoryMin('');
                    setIncomeHistoryMax('');
                  }}
                >
                  <Icon name="refresh" size={15} />
                  Reset Semua Filter
                </button>
              </div>

              {filteredIncomeHistory.map((t) => (
                <div className="data-card" key={t.id}>
                  <h3>{t.category}</h3>
                  <p>
                    {formatDate(t.date)} ·{' '}
                    {t.counterparty_name || t.description || 'Tanpa keterangan'}
                  </p>
                  {t.bank_name && <p>Bank: {t.bank_name}</p>}
                  {t.reference_number && <p>Referensi: {t.reference_number}</p>}
                  <div className="transaction-main-row">
                    <strong className="green">{rupiah(t.amount)}</strong>

                    <button
                      type="button"
                      className="income-detail-button"
                      onClick={() =>
                        setExpandedIncomeId(
                          expandedIncomeId === t.id ? null : t.id
                        )
                      }
                    >
                      <Icon name="eye" size={14} />
                      {expandedIncomeId === t.id
                        ? 'Tutup Detail'
                        : 'Lihat Detail'}
                    </button>
                  </div>

                  {expandedIncomeId === t.id && (
                    <div className="transaction-detail">
                      <h4>Detail Transaksi Uang Masuk</h4>
                      <p>
                        <strong>ID Transaksi:</strong> {t.id}
                      </p>
                      <p>
                        <strong>Tanggal:</strong> {formatDate(t.date)}
                      </p>
                      <p>
                        <strong>Kategori:</strong> {t.category}
                      </p>
                      <p>
                        <strong>Nominal:</strong> {rupiah(t.amount)}
                      </p>
                      <p>
                        <strong>Santri:</strong>{' '}
                        {students.find((s) => s.id === t.student_id)
                          ?.full_name || '-'}
                      </p>
                      <p>
                        <strong>Pengirim:</strong> {t.counterparty_name || '-'}
                      </p>
                      <p>
                        <strong>Metode Pembayaran:</strong>{' '}
                        {t.payment_method || '-'}
                      </p>
                      <p>
                        <strong>Bank:</strong> {t.bank_name || '-'}
                      </p>
                      <p>
                        <strong>Pemilik Rekening:</strong>{' '}
                        {t.account_name || '-'}
                      </p>
                      <p>
                        <strong>Nomor Referensi:</strong>{' '}
                        {t.reference_number || '-'}
                      </p>
                      <p>
                        <strong>Keterangan:</strong> {t.description || '-'}
                      </p>

                      <div>
                        <strong>Bukti Transaksi:</strong>
                        {t.receipt_url ? (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={receiptLoading}
                            onClick={() =>
                              openTransactionReceipt(t.receipt_url!)
                            }
                          >
                            <Icon name="file-text" size={14} />
                            {receiptLoading ? 'Membuka...' : 'Lihat Bukti'}
                          </button>
                        ) : (
                          <p>Tidak ada bukti transaksi.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {t.receipt_file_name && <p>Bukti: {t.receipt_file_name}</p>}

                  {canManage && (
                    <div className="transaction-actions">
                      <button
                        className="edit-button"
                        disabled={busy}
                        onClick={() => startEditIncome(t)}
                      >
                        <Icon name="edit" size={14} /> Edit
                      </button>
                      <button
                        className="delete-button"
                        disabled={busy}
                        onClick={() => deleteIncome(t)}
                      >
                        <Icon name="trash" size={14} /> Hapus
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {filteredIncomeHistory.length === 0 && (
                <p className="empty">Belum ada uang masuk.</p>
              )}
            </section>
          </>
        )}

        {page === 'expenses' && (
          <>
            <section className="page-intro">
              <span className="eyebrow">PENGELUARAN KAS PONDOK</span>
              <h1>Uang Keluar</h1>
              <p>Catat biaya operasional dan kebutuhan pondok.</p>
            </section>

            {canManage && !showExpenseForm && (
              <button
                className="primary-button"
                style={{ width: '100%', marginBottom: 16 }}
                onClick={() => setShowExpenseForm(true)}
              >
                <Icon name="plus" size={16} /> Catat Uang Keluar
              </button>
            )}

            {canManage && showExpenseForm && (
              <section className="panel">
                <div className="section-heading">
                  <h2>Formulir Uang Keluar</h2>
                </div>
                <TransactionReceiptOCR
                  onTextExtracted={handleExpenseOCR}
                  onFileSelected={setExpenseReceipt}
                />

                <form onSubmit={saveExpense} className="form-grid">
                  <div className="form-field">
                    <label>Tanggal Pengeluaran</label>
                    <input
                      id="expense-date"
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Kategori</label>
                    <input
                      id="expenseCategory"
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      placeholder="Contoh: Konsumsi"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Nominal (Rp)</label>
                    <input
                      id="expense-amount"
                      type="number"
                      min="1"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Penerima / Toko</label>
                    <input
                      value={expensePayee}
                      onChange={(e) => setExpensePayee(e.target.value)}
                      placeholder="Nama toko atau penerima"
                    />
                  </div>
                  <div className="form-field">
                    <label>Metode Pembayaran</label>
                    <select
                      value={expenseMethod}
                      onChange={(e) => setExpenseMethod(e.target.value)}
                    >
                      <option value="tunai">Tunai</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Bukti Nota (Opsional)</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) =>
                        setExpenseReceipt(e.target.files?.[0] || null)
                      }
                    />
                    <small className="inline-note">
                      Pembelian tunai tanpa nota tetap bisa dicatat.
                    </small>
                  </div>
                  <div className="form-field full-field">
                    <label>Keterangan</label>
                    <textarea
                      rows={2}
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                    />
                  </div>
                  {expenseOcrText && (
                    <div className="form-field full-field">
                      <label>Hasil teks OCR</label>
                      <textarea rows={4} value={expenseOcrText} readOnly />
                      <small className="inline-note">
                        Periksa nominal dan tanggal sebelum menyimpan.
                      </small>
                    </div>
                  )}
                  <div className="form-actions full-field">
                    <button className="primary-button" disabled={busy}>
                      <Icon name="check" size={15} />{' '}
                      {busy ? 'Menyimpan...' : 'Simpan Uang Keluar'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={resetExpenseForm}
                    >
                      Batal
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="section-heading">
                <h2>Riwayat Uang Keluar</h2>
                <button className="secondary-button" onClick={refreshAll}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>

              {transactions
                .filter((t) => t.type === 'expense')
                .map((t) => (
                  <div className="data-card" key={t.id}>
                    <h3>{t.category}</h3>
                    <p>
                      {formatDate(t.date)} ·{' '}
                      {t.counterparty_name ||
                        t.description ||
                        'Tanpa keterangan'}
                    </p>
                    <div className="transaction-main-row">
                      <strong className="red">{rupiah(t.amount)}</strong>

                      <button
                        type="button"
                        className="income-detail-button"
                        onClick={() =>
                          setExpandedExpenseId(
                            expandedExpenseId === t.id ? null : t.id
                          )
                        }
                      >
                        <Icon name="eye" size={14} />
                        {expandedExpenseId === t.id
                          ? 'Tutup Detail'
                          : 'Lihat Detail'}
                      </button>
                    </div>
                    {expandedExpenseId === t.id && (
                      <div className="transaction-detail">
                        <h4>Detail Transaksi Uang Keluar</h4>
                        <p>
                          <strong>ID Transaksi:</strong> {t.id}
                        </p>
                        <p>
                          <strong>Tanggal:</strong> {formatDate(t.date)}
                        </p>
                        <p>
                          <strong>Kategori:</strong> {t.category}
                        </p>
                        <p>
                          <strong>Nominal:</strong> {rupiah(t.amount)}
                        </p>
                        <p>
                          <strong>Penerima:</strong>{' '}
                          {t.counterparty_name || '-'}
                        </p>
                        <p>
                          <strong>Metode Pembayaran:</strong>{' '}
                          {t.payment_method || '-'}
                        </p>
                        <p>
                          <strong>Keterangan:</strong> {t.description || '-'}
                        </p>

                        <div>
                          <strong>Bukti Transaksi:</strong>
                          {t.receipt_url ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={receiptLoading}
                              onClick={() =>
                                openTransactionReceipt(t.receipt_url!)
                              }
                            >
                              <Icon name="file-text" size={14} />
                              {receiptLoading ? 'Membuka...' : 'Lihat Bukti'}
                            </button>
                          ) : (
                            <p>Tidak ada bukti transaksi.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {t.receipt_file_name && <p>Bukti: {t.receipt_file_name}</p>}

                    {canManage && (
                      <div className="transaction-actions">
                        <button
                          className="edit-button"
                          disabled={busy}
                          onClick={() => startEditExpense(t)}
                        >
                          <Icon name="edit" size={14} /> Edit
                        </button>
                        <button
                          className="delete-button"
                          disabled={busy}
                          onClick={() => deleteExpense(t)}
                        >
                          <Icon name="trash" size={14} /> Hapus
                        </button>
                      </div>
                    )}
                  </div>
                ))}

              {transactions.filter((t) => t.type === 'expense').length ===
                0 && <p className="empty">Belum ada uang keluar.</p>}
            </section>
          </>
        )}

        {page === 'reports' && (
          <>
            <section className="page-intro">
              <span className="eyebrow">LAPORAN KEUANGAN</span>
              <h1>Laporan</h1>
              <p>Pantau pemasukan dan pengeluaran berdasarkan periode.</p>
            </section>

            <section className="panel">
              <div className="form-grid">
                <div className="form-field">
                  <label>Tanggal Mulai</label>
                  <input
                    type="date"
                    value={reportStart}
                    onChange={(e) => setReportStart(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Tanggal Akhir</label>
                  <input
                    type="date"
                    value={reportEnd}
                    onChange={(e) => setReportEnd(e.target.value)}
                  />
                </div>
              </div>

              <section className="summary-grid">
                <div className="summary-card">
                  <span>Total Uang Masuk</span>
                  <strong className="green">{rupiah(reportIncome)}</strong>
                </div>
                <div className="summary-card">
                  <span>Total Uang Keluar</span>
                  <strong className="red">{rupiah(reportExpense)}</strong>
                </div>
                <div className="summary-card balance-card">
                  <span>Selisih</span>
                  <strong>{rupiah(reportIncome - reportExpense)}</strong>
                </div>
              </section>

              <button className="primary-button" onClick={downloadReport}>
                <Icon name="report" size={15} /> Unduh Laporan CSV
              </button>
            </section>

            <section className="panel">
              <h2>Rincian Transaksi ({reportTransactions.length})</h2>
              {reportTransactions.map((t) => (
                <div className="data-card" key={t.id}>
                  <h3>{t.category}</h3>
                  <p>
                    {formatDate(t.date)} ·{' '}
                    {t.description || t.counterparty_name || 'Tanpa keterangan'}
                  </p>
                  <strong className={t.type === 'income' ? 'green' : 'red'}>
                    {t.type === 'income' ? '+' : '-'} {rupiah(t.amount)}
                  </strong>
                </div>
              ))}
              {reportTransactions.length === 0 && (
                <p className="empty">Tidak ada transaksi pada periode ini.</p>
              )}
            </section>
          </>
        )}

        {page === 'profile' && (
          <>
            <section className="page-intro">
              <span className="eyebrow">PUSAT PENGATURAN</span>
              <h1>Saya</h1>
              <p>Kelola akun, keamanan, dan preferensi aplikasi.</p>
            </section>

            <section className="panel">
              <div className="profile-heading">
                <div className="profile-avatar">
                  {(fullName || user.email || 'N').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2>{fullName || 'Pengguna'}</h2>
                  <p>
                    {user.email} · {userRole || 'Peran belum diatur'}
                  </p>
                </div>
              </div>

              <div className="profile-menu">
                {[
                  [
                    'overview',
                    'Ringkasan akun',
                    'Informasi akun dan status akses',
                  ],
                  ['account', 'Profil akun', 'Ubah nama pengguna'],
                  ['security', 'Keamanan', 'Ubah password dan keluar'],
                  ['pondok', 'Pengaturan pondok', 'Identitas dan nama pondok'],
                  [
                    'preferences',
                    'Preferensi aplikasi',
                    'Tampilan dan kenyamanan',
                  ],
                  ['about', 'Tentang aplikasi', 'Informasi sistem'],
                ].map(([id, title, description]) => (
                  <button
                    key={id}
                    type="button"
                    className={`profile-menu-item ${
                      profileSection === id ? 'selected' : ''
                    }`}
                    onClick={() => setProfileSection(id)}
                  >
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    <span className="profile-chevron">›</span>
                  </button>
                ))}
              </div>
            </section>

            {profileSection === 'overview' && (
              <section className="panel profile-card">
                <h2>Ringkasan Akun</h2>
                <div className="profile-info">
                  <div>
                    <span>Nama pengguna</span>
                    <strong>{fullName || 'Belum diisi'}</strong>
                  </div>
                  <div>
                    <span>Email akun</span>
                    <strong>{user.email}</strong>
                  </div>
                  <div>
                    <span>Peran pengguna</span>
                    <strong>{userRole || 'Belum diatur'}</strong>
                  </div>
                  <div>
                    <span>Status sesi</span>
                    <strong>Aktif</strong>
                  </div>
                  <div>
                    <span>ID akun</span>
                    <strong>{user.id}</strong>
                  </div>
                </div>
              </section>
            )}

            {profileSection === 'account' && (
              <section className="panel profile-card">
                <h2>Profil Akun</h2>
                <form onSubmit={saveProfile} className="form-grid">
                  <div className="form-field full-field">
                    <label>Nama Pengguna</label>
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field full-field">
                    <label>Email Akun</label>
                    <input value={user.email || ''} disabled />
                  </div>
                  <div className="form-actions full-field">
                    <button className="primary-button" disabled={busy}>
                      <Icon name="check" size={15} /> Simpan Profil
                    </button>
                  </div>
                </form>
              </section>
            )}

            {profileSection === 'security' && (
              <section className="panel profile-card">
                <h2>Keamanan Akun</h2>
                <p className="inline-note">
                  Gunakan password yang kuat dan jangan bagikan kepada orang
                  lain.
                </p>
                <form onSubmit={updatePassword} className="form-grid">
                  <div className="form-field full-field">
                    <label>Password Baru</label>
                    <input
                      type="password"
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field full-field">
                    <label>Konfirmasi Password Baru</label>
                    <input
                      type="password"
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-actions full-field">
                    <button className="primary-button" disabled={busy}>
                      Perbarui Password
                    </button>
                  </div>
                </form>
                <button
                  className="delete-button"
                  style={{ width: '100%', marginTop: 20 }}
                  onClick={logout}
                >
                  <Icon name="logout" size={15} /> Keluar dari Aplikasi
                </button>
              </section>
            )}

            {profileSection === 'pondok' && (
              <section className="panel profile-card">
                <h2>Identitas Pondok</h2>
                <div className="form-field">
                  <label>Nama Pondok</label>
                  <input
                    value={pondokName}
                    onChange={(e) => setPondokName(e.target.value)}
                  />
                  <small className="inline-note">
                    Nama ini hanya tersimpan selama sesi aplikasi. Penyimpanan
                    permanen memerlukan pengaturan tabel profil pondok di
                    database.
                  </small>
                </div>
              </section>
            )}

            {profileSection === 'preferences' && (
              <section className="panel profile-card">
                <h2>Preferensi Tampilan</h2>
                <div className="form-field">
                  <label>Tema Aplikasi</label>
                  <select
                    value={themeMode}
                    onChange={(e) => setThemeMode(e.target.value)}
                  >
                    <option value="glass">Glassmorphism Emerald</option>
                  </select>
                  <small className="inline-note">
                    Tema Glassmorphism aktif. Pilihan tema tambahan dapat
                    ditambahkan pada pembaruan berikutnya.
                  </small>
                </div>
              </section>
            )}

            {profileSection === 'about' && (
              <section className="panel profile-card">
                <h2>NUR QOMARIL WUJUD</h2>
                <p>Sistem Administrasi Keuangan Pondok Pesantren.</p>
                <div className="profile-info">
                  <div>
                    <span>Versi aplikasi</span>
                    <strong>1.0.0</strong>
                  </div>
                  <div>
                    <span>Platform</span>
                    <strong>Web Application</strong>
                  </div>
                  <div>
                    <span>Sistem data</span>
                    <strong>Supabase</strong>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {message && (
          <div
            role="alert"
            style={{
              position: 'fixed',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% - 32px)',
              maxWidth: '480px',
              zIndex: 99999,
              padding: '16px 20px',
              borderRadius: '14px',
              background: /berhasil|sukses/i.test(message)
                ? '#e8f7ee'
                : '#fff0f0',
              color: /berhasil|sukses/i.test(message) ? '#176b3a' : '#a52828',
              border: `1px solid ${
                /berhasil|sukses/i.test(message) ? '#a8dfbb' : '#f0b5b5'
              }`,
              boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
              fontSize: '14px',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {message}
          </div>
        )}

        <footer>
          © 2026 NUR QOMARIL WUJUD
          <br />
          Sistem Administrasi Keuangan Pondok Pesantren
        </footer>
      </main>

      <nav className="bottom-nav">
        {nav.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => {
              setPage(item.id);
              setMessage('');
              if (item.id === 'dashboard') refreshAll();
              if (item.id === 'students') loadStudents();
              if (item.id === 'income') loadTransactions();
              if (item.id === 'expenses') {
                loadTransactions();
                loadExpenses();
              }
              if (item.id === 'reports') loadTransactions();
              if (item.id === 'profile') setProfileSection('overview');
            }}
          >
            <Icon name={item.icon as any} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
