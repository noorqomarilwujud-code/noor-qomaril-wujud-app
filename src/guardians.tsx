import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./lib/supabase";

type Guardian = {
  id: number;
  full_name: string;
  phone: string | null;
  relationship: string | null;
  address: string | null;
  notes: string | null;
};

type Student = {
  id: number;
  full_name: string;
  student_number: string | null;
  status: string;
};

type GuardianLink = {
  id: number;
  guardian_id: number;
  student_id: number;
  is_primary: boolean;
};

export default function Guardians() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("Ayah");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [primaryStudent, setPrimaryStudent] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [guardianResult, studentResult, linkResult] = await Promise.all([
      supabase
        .from("guardians")
        .select("*")
        .order("full_name", { ascending: true }),

      supabase
        .from("students")
        .select("id, full_name, student_number, status")
        .order("full_name", { ascending: true }),

      supabase
        .from("student_guardians")
        .select("*"),
    ]);

    if (guardianResult.error) {
      setMessage("Gagal mengambil data wali: " + guardianResult.error.message);
    } else {
      setGuardians((guardianResult.data || []) as Guardian[]);
    }

    if (studentResult.error) {
      setMessage("Gagal mengambil data santri: " + studentResult.error.message);
    } else {
      setStudents((studentResult.data || []) as Student[]);
    }

    if (linkResult.error) {
      setMessage("Gagal mengambil hubungan wali dan santri: " + linkResult.error.message);
    } else {
      setLinks((linkResult.data || []) as GuardianLink[]);
    }

    setLoading(false);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setRelationship("Ayah");
    setAddress("");
    setNotes("");
    setSelectedStudents([]);
    setPrimaryStudent(null);
  }

  function startEdit(guardian: Guardian) {
    const guardianLinks = links.filter(
      (link) => link.guardian_id === guardian.id
    );

    setEditingId(guardian.id);
    setName(guardian.full_name);
    setPhone(guardian.phone || "");
    setRelationship(guardian.relationship || "Lainnya");
    setAddress(guardian.address || "");
    setNotes(guardian.notes || "");

    setSelectedStudents(guardianLinks.map((link) => link.student_id));

    const primary = guardianLinks.find((link) => link.is_primary);
    setPrimaryStudent(primary?.student_id ?? null);

    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleStudent(studentId: number) {
    setSelectedStudents((previous) => {
      if (previous.includes(studentId)) {
        return previous.filter((id) => id !== studentId);
      }

      return [...previous, studentId];
    });

    setPrimaryStudent((previous) => {
      if (previous === studentId) return null;
      return previous;
    });
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      setMessage("Nama wali wajib diisi.");
      return;
    }

    if (selectedStudents.length > 0 && !primaryStudent) {
      setMessage("Pilih satu santri sebagai hubungan utama wali ini.");
      return;
    }

    if (
      primaryStudent !== null &&
      !selectedStudents.includes(primaryStudent)
    ) {
      setMessage("Wali utama harus termasuk santri yang dipilih.");
      return;
    }

    setSaving(true);
    setMessage("");

    const guardianData = {
      full_name: name.trim(),
      phone: phone.trim() || null,
      relationship,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };

    let guardianId = editingId;

    if (editingId !== null) {
      const { error } = await supabase
        .from("guardians")
        .update(guardianData)
        .eq("id", editingId);

      if (error) {
        setSaving(false);
        setMessage("Gagal memperbarui wali: " + error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("guardians")
        .insert([guardianData])
        .select("id")
        .single();

      if (error || !data) {
        setSaving(false);
        setMessage("Gagal menambahkan wali: " + (error?.message || "Data tidak ditemukan."));
        return;
      }

      guardianId = data.id;
    }

    const existingLinks = links.filter(
      (link) => link.guardian_id === guardianId
    );

    const newStudentIds = selectedStudents.filter(
      (studentId) =>
        !existingLinks.some((link) => link.student_id === studentId)
    );

    if (newStudentIds.length > 0) {
      const newLinks = newStudentIds.map((studentId) => ({
        guardian_id: guardianId,
        student_id: studentId,
        is_primary: studentId === primaryStudent,
      }));

      const { error } = await supabase
        .from("student_guardians")
        .insert(newLinks);

      if (error) {
        setSaving(false);
        setMessage(
          "Data wali tersimpan, tetapi hubungan santri gagal disimpan: " +
            error.message
        );
        await loadData();
        return;
      }
    }

    const existingPrimary = existingLinks.find(
      (link) => link.is_primary
    );

    if (
      primaryStudent !== null &&
      existingPrimary &&
      existingPrimary.student_id !== primaryStudent
    ) {
      const { error } = await supabase
        .from("student_guardians")
        .update({ is_primary: false })
        .eq("id", existingPrimary.id);

      if (error) {
        setSaving(false);
        setMessage("Gagal memperbarui wali utama: " + error.message);
        await loadData();
        return;
      }

      const selectedExisting = existingLinks.find(
        (link) => link.student_id === primaryStudent
      );

      if (selectedExisting) {
        const { error: primaryError } = await supabase
          .from("student_guardians")
          .update({ is_primary: true })
          .eq("id", selectedExisting.id);

        if (primaryError) {
          setSaving(false);
          setMessage("Gagal menetapkan wali utama: " + primaryError.message);
          await loadData();
          return;
        }
      }
    } else if (
      primaryStudent !== null &&
      !existingPrimary &&
      existingLinks.some((link) => link.student_id === primaryStudent)
    ) {
      const selectedExisting = existingLinks.find(
        (link) => link.student_id === primaryStudent
      );

      if (selectedExisting) {
        const { error } = await supabase
          .from("student_guardians")
          .update({ is_primary: true })
          .eq("id", selectedExisting.id);

        if (error) {
          setSaving(false);
          setMessage("Gagal menetapkan wali utama: " + error.message);
          await loadData();
          return;
        }
      }
    }

    setSaving(false);
    resetForm();
    setMessage("Data wali berhasil disimpan.");
    await loadData();
  }

  const filteredGuardians = useMemo(() => {
    const keyword = search.toLowerCase();

    return guardians.filter((guardian) => {
      const matchesName = guardian.full_name.toLowerCase().includes(keyword);
      const matchesPhone = (guardian.phone || "").includes(keyword);

      return matchesName || matchesPhone;
    });
  }, [guardians, search]);

  function getGuardianStudents(guardianId: number) {
    return links
      .filter((link) => link.guardian_id === guardianId)
      .map((link) => ({
        ...link,
        student: students.find((student) => student.id === link.student_id),
      }))
      .filter((item) => item.student);
  }

  if (loading) {
    return <div className="loading">Memuat data wali santri...</div>;
  }

  return (
    <div className="guardian-module">
      <style>{`
        .guardian-module {
          width: 100%;
          min-width: 0;
        }

        .guardian-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .guardian-form-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
        }

        .guardian-form-field label {
          color: #536052;
          font-size: 13px;
          font-weight: 600;
        }

        .guardian-form-field input,
        .guardian-form-field select,
        .guardian-form-field textarea {
          width: 100%;
          box-sizing: border-box;
        }

        .guardian-full {
          grid-column: 1 / -1;
        }

        .guardian-student-picker {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-top: 5px;
        }

        .guardian-student-option {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 11px;
          border: 1px solid #e9e0d0;
          border-radius: 10px;
          background: #fffdf8;
          font-size: 12px;
        }

        .guardian-student-option input {
          width: auto;
          margin-top: 3px;
        }

        .guardian-list {
          display: flex;
          flex-direction: column;
          gap: 13px;
        }

        .guardian-card {
          background: #fffdf8;
          border: 1px solid #e9e0d0;
          border-radius: 14px;
          padding: 16px;
          min-width: 0;
        }

        .guardian-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eee7db;
        }

        .guardian-card h3 {
          margin: 0;
          color: #304738;
          font-size: 16px;
          overflow-wrap: anywhere;
        }

        .guardian-card p {
          margin: 5px 0 0;
          color: #898477;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .guardian-student-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 13px 0;
        }

        .guardian-student-chip {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
          background: #f4f0e7;
          border-radius: 8px;
          padding: 9px 10px;
          color: #344c3c;
          font-size: 12px;
        }

        .guardian-card-actions {
          display: flex;
          gap: 9px;
          padding-top: 12px;
          border-top: 1px solid #eee7db;
        }

        .guardian-card-actions button {
          flex: 1;
          min-height: 38px;
        }

        .guardian-search {
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 14px;
        }

        .guardian-primary-label {
          color: #a0834f;
          font-weight: 700;
          font-size: 10px;
        }

        @media (max-width: 600px) {
          .guardian-form-grid {
            grid-template-columns: 1fr;
          }

          .guardian-full {
            grid-column: 1;
          }

          .guardian-student-picker {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className="page-intro">
        <span className="eyebrow">ADMINISTRASI SANTRI</span>
        <h1>Data Wali Santri</h1>
        <p>Kelola identitas wali dan hubungan mereka dengan santri.</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FORMULIR WALI</span>
            <h2>{editingId ? "Edit Data Wali" : "Tambah Wali Baru"}</h2>
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="guardian-form-grid">
            <div className="guardian-form-field">
              <label>Nama Lengkap Wali *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap wali"
                required
              />
            </div>

            <div className="guardian-form-field">
              <label>Nomor HP / WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
              />
            </div>

            <div className="guardian-form-field">
              <label>Hubungan Keluarga</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
              >
                <option>Ayah</option>
                <option>Ibu</option>
                <option>Kakek</option>
                <option>Nenek</option>
                <option>Paman</option>
                <option>Bibi</option>
                <option>Kakak</option>
                <option>Wali lainnya</option>
              </select>
            </div>

            <div className="guardian-form-field guardian-full">
              <label>Alamat</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Alamat lengkap wali"
              />
            </div>

            <div className="guardian-form-field guardian-full">
              <label>Catatan</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Catatan tambahan (opsional)"
              />
            </div>

            <div className="guardian-form-field guardian-full">
              <label>Hubungkan dengan Santri</label>
              <p className="empty">
                Pilih satu atau beberapa santri yang memiliki wali ini.
              </p>

              {students.length === 0 ? (
                <p className="empty">
                  Belum ada data santri. Tambahkan santri terlebih dahulu.
                </p>
              ) : (
                <div className="guardian-student-picker">
                  {students.map((student) => (
                    <label
                      className="guardian-student-option"
                      key={student.id}
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={() => toggleStudent(student.id)}
                      />
                      <span>
                        <strong>{student.full_name}</strong>
                        <br />
                        <small>
                          {student.student_number || "Tanpa nomor induk"}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedStudents.length > 0 && (
              <div className="guardian-form-field guardian-full">
                <label>Wali Utama untuk Santri</label>
                <select
                  value={primaryStudent ?? ""}
                  onChange={(e) =>
                    setPrimaryStudent(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  required
                >
                  <option value="">Pilih santri utama</option>
                  {students
                    .filter((student) =>
                      selectedStudents.includes(student.id)
                    )
                    .map((student) => (
                      <option value={student.id} key={student.id}>
                        {student.full_name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="guardian-full form-actions">
              <button className="primary-button" disabled={saving}>
                {saving
                  ? "Menyimpan..."
                  : editingId
                    ? "Simpan Perubahan"
                    : "Simpan Data Wali"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetForm}
                >
                  Batal Edit
                </button>
              )}
            </div>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DATABASE WALI</span>
            <h2>Daftar Wali ({filteredGuardians.length})</h2>
          </div>

          <button className="secondary-button" onClick={loadData}>
            ↻ Refresh
          </button>
        </div>

        <input
          className="guardian-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau nomor HP wali..."
        />

        <div className="guardian-list">
          {filteredGuardians.map((guardian) => {
            const connectedStudents = getGuardianStudents(guardian.id);

            return (
              <article className="guardian-card" key={guardian.id}>
                <div className="guardian-card-top">
                  <div>
                    <h3>{guardian.full_name}</h3>
                    <p>
                      {guardian.relationship || "Hubungan belum diisi"} ·{" "}
                      {guardian.phone || "Nomor HP belum diisi"}
                    </p>
                  </div>
                </div>

                <div className="guardian-student-list">
                  <strong>Santri yang terhubung</strong>

                  {connectedStudents.length === 0 ? (
                    <p>Belum terhubung dengan santri.</p>
                  ) : (
                    connectedStudents.map((item) => (
                      <div
                        className="guardian-student-chip"
                        key={item.student_id}
                      >
                        <span>
                          {item.student?.full_name}
                          <br />
                          <small>
                            {item.student?.student_number || "Tanpa nomor induk"}
                          </small>
                        </span>

                        {item.is_primary && (
                          <span className="guardian-primary-label">
                            WALI UTAMA
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {guardian.address && (
                  <p>
                    <strong>Alamat:</strong> {guardian.address}
                  </p>
                )}

                <div className="guardian-card-actions">
                  <button
                    className="edit-button"
                    onClick={() => startEdit(guardian)}
                  >
                    Edit Data
                  </button>
                </div>
              </article>
            );
          })}

          {filteredGuardians.length === 0 && (
            <p className="empty">Belum ada data wali yang ditemukan.</p>
          )}
        </div>
      </section>

      {message && <div className="message">{message}</div>}
    </div>
  );
}