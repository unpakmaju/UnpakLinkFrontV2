import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { useToast } from "@/Providers/ToastProvider";
import { useAuth } from "@/Providers/AuthProvider";
import { isSafeHttpUrl } from "@/Common/Utils";
import Logo from "@/assets/logo.svg";

const BASEAPI = import.meta.env.VITE_BASEAPI;

export default function SmartLink() {
  const { shorturl } = useParams();
  const { addToast } = useToast();
  const { getValidToken } = useAuth();

  const isMounted = React.useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null); // notfound | protect | count | default
  const [status, setStatus] = useState(null); // waiting | active | expired

  const [password, setPassword] = useState(null);
  const [long, setLong] = useState(null);

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [timeLeft, setTimeLeft] = useState(null);

  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // ================= LOAD DATA ======================
  async function loadData() {
    if (!shorturl || shorturl === "undefined") return;
    setLoading(true);

    try {
      const validToken = getValidToken();
      const reqHeaders = {
        "Content-Type": "application/json",
        "X-API-KEY": "putiklink",
      };
      if (validToken) {
        reqHeaders.Authorization = `Bearer ${validToken}`;
      }

      const res = await fetch(
        `${BASEAPI}/link/short/${encodeURIComponent(shorturl)}?`,
        {
          method: "GET",
          headers: reqHeaders,
        },
      );

      if (!isMounted.current) return;

      if (res.status === 404) {
        setMode("notfound");
        return;
      }

      const body = await res.json();

      if (!isMounted.current) return;

      if (
        body.Status === "deleted" ||
        body.Status === "delete" ||
        body.Status === "archive" ||
        body.Status == null
      ) {
        setMode("notfound");
        return;
      }

      setPassword(body.Password);
      setLong(body.LongUrl);

      // ================= COUNT MODE ======================
      if (body.StartAccess && body.EndAccess) {
        const start = new Date(body.StartAccess);
        const end = new Date(body.EndAccess);

        setStartDate(start);
        setEndDate(end);
        setMode("count");

        const now = Date.now();
        const startTime = start.getTime();
        const endTime = end.getTime();

        if (now < startTime) setStatus("waiting");
        else if (now >= startTime && now <= endTime) setStatus("active");
        else setStatus("expired");

        return;
      }

      // ================= PROTECT MODE ======================
      if (body.Password) {
        setMode("protect");
        return;
      }

      // ================= DEFAULT MODE ======================
      setMode("default");
    } catch (err) {
      console.error(err);
      if (isMounted.current) {
        setMode("notfound");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadData();
  }, [shorturl]);

  // ================= STATUS HELPER ======================
  const getStatus = () => {
    if (!startDate || !endDate) return null;

    const now = Date.now();
    const start = startDate.getTime();
    const end = endDate.getTime();

    if (now < start) return "waiting";
    if (now >= start && now <= end) return "active";
    return "expired";
  };

  // ================= REALTIME COUNTDOWN ======================
  useEffect(() => {
    if (mode !== "count") return;

    const updateTimer = () => {
      const newStatus = getStatus();
      setStatus((prevStatus) => {
        if (
          prevStatus === "waiting" &&
          newStatus === "active" &&
          !long &&
          !password
        ) {
          loadData();
        }
        return newStatus;
      });

      if (newStatus === "expired") {
        setTimeLeft(null);
        return;
      }

      const now = Date.now();
      const target =
        newStatus === "waiting" ? startDate.getTime() : endDate.getTime();

      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [mode, startDate, endDate, long, password]);

  // ================= REDIRECT ======================
  useEffect(() => {
    if (!long) return;

    if (mode === "default" || (mode === "count" && status === "active")) {
      if (password) return;
      if (!isSafeHttpUrl(long)) {
        addToast("error", "URL tujuan tidak valid atau tidak aman");
        setMode("notfound");
        return;
      }
      window.location.href = long;
    }
  }, [mode, status, long, password]);

  const format = (num) => String(num ?? 0).padStart(2, "0");
  const isExpired = status === "expired";

  const formatDateIndo = (dateObj) => {
    if (!dateObj || isNaN(dateObj.getTime())) return "-";
    return dateObj.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  async function unlockHandler(e) {
    if (e) e.preventDefault();
    if (!code || !code.trim()) {
      addToast("error", "Kode rahasia wajib diisi");
      return;
    }

    if (password === "PROTECTED") {
      setUnlocking(true);
      try {
        const validToken = getValidToken();
        const reqHeaders = {
          "Content-Type": "application/json",
          "X-API-KEY": "putiklink",
        };
        if (validToken) {
          reqHeaders.Authorization = `Bearer ${validToken}`;
        }

        const res = await fetch(
          `${BASEAPI}/link/short/${encodeURIComponent(shorturl)}?code=${encodeURIComponent(code)}`,
          {
            method: "GET",
            headers: reqHeaders,
          },
        );

        if (!res.ok) {
          addToast("error", "Kode rahasia tidak sesuai");
          return;
        }

        const body = await res.json();
        const targetUrl = body?.LongUrl ?? "https://unpak.ac.id";
        if (!isSafeHttpUrl(targetUrl)) {
          addToast("error", "URL tujuan tidak valid atau tidak aman");
          return;
        }
        window.location.href = targetUrl;
      } catch (err) {
        console.error(err);
        addToast("error", "Gagal memverifikasi kode rahasia");
      } finally {
        setUnlocking(false);
      }
      return;
    }

    if (code === password) {
      const targetUrl = long ?? "https://unpak.ac.id";
      if (!isSafeHttpUrl(targetUrl)) {
        addToast("error", "URL tujuan tidak valid atau tidak aman");
        return;
      }
      window.location.href = targetUrl;
    } else {
      addToast("error", "Kode rahasia tidak sesuai");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#362175] via-[#49318f] to-[#6c53b4] flex flex-col items-center justify-center p-6 font-montserrat text-white">
        <div className="w-12 h-12 border-4 border-white/20 border-t-[#ffc107] rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-semibold tracking-wide text-purple-100">
          Memeriksa tautan unpak.link/{shorturl}...
        </p>
      </div>
    );
  }

  if (mode === "default" || (mode === "count" && status === "active")) {
    if (!password) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#362175] via-[#49318f] to-[#6c53b4] flex flex-col items-center justify-center p-6 font-montserrat text-white">
          <div className="w-12 h-12 border-4 border-white/20 border-t-[#ffc107] rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-semibold tracking-wide text-purple-100">
            Mengalihkan ke halaman tujuan...
          </p>
        </div>
      );
    }
  }

  // ================= 1. NOT FOUND (404) ======================
  if (mode === "notfound") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#362175] via-[#49318f] to-[#6c53b4] flex flex-col items-center justify-center px-4 py-10 font-montserrat">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          {/* Top Purple Banner */}
          <div className="bg-[#49318f] px-8 py-6 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <img
                src={Logo}
                alt="Logo UNPAK"
                className="w-10 h-10 object-contain bg-white/10 p-1.5 rounded-xl border border-white/15"
              />
              <div>
                <span className="text-white font-extrabold text-lg tracking-wide block leading-none">
                  unpak.link
                </span>
                <span className="text-purple-200 text-[11px] font-medium">
                  Universitas Pakuan
                </span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#ffc107] text-[#362175]">
              Error 404
            </span>
          </div>

          {/* Main Content */}
          <div className="p-8 sm:p-10 text-center space-y-6">
            <div>
              <div className="text-7xl sm:text-8xl font-black text-[#49318f] tracking-tight leading-none select-none">
                404
              </div>
              <div className="w-16 h-1.5 bg-[#ffc107] mx-auto rounded-full mt-4"></div>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">
                Tautan Tidak Tersedia
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                Tautan pendek yang Anda tuju tidak ditemukan, telah dihapus,
                atau sedang dinonaktifkan. Pastikan penulisan huruf besar dan
                kecil pada alamat tautan sudah sesuai.
              </p>
            </div>

            {/* Requested Short URL Pill */}
            <div className="bg-[#49318f]/5 border border-[#49318f]/15 rounded-2xl px-4 py-3.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Alamat Tautan yang Diakses
              </p>
              <p className="text-base sm:text-lg font-extrabold text-[#49318f] break-all">
                unpak.link/{shorturl ?? "---"}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                to="/"
                className="flex-1 bg-[#49318f] hover:bg-[#382278] text-white font-bold text-sm py-3.5 px-6 rounded-xl transition shadow-md text-center"
              >
                Kembali ke Beranda
              </Link>
              <a
                href="https://www.unpak.ac.id"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 border border-gray-200 hover:border-[#49318f]/40 hover:bg-gray-50 text-gray-700 font-bold text-sm py-3.5 px-6 rounded-xl transition text-center"
              >
                Portal UNPAK
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center text-xs text-gray-400 font-medium">
            © unpak.link — Bagian Perencanaan & Sistem Informasi (BPSI)
            Universitas Pakuan
          </div>
        </div>
      </div>
    );
  }

  // ================= 2. PROTECTED LINK (PASSWORD) ======================
  if (
    mode === "protect" ||
    (mode === "count" && status === "active" && password)
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#362175] via-[#49318f] to-[#6c53b4] flex flex-col items-center justify-center px-4 py-10 font-montserrat">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          {/* Header */}
          <div className="bg-[#49318f] px-8 py-6 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <img
                src={Logo}
                alt="Logo UNPAK"
                className="w-10 h-10 object-contain bg-white/10 p-1.5 rounded-xl border border-white/15"
              />
              <div>
                <span className="text-white font-extrabold text-lg tracking-wide block leading-none">
                  unpak.link
                </span>
                <span className="text-purple-200 text-[11px] font-medium">
                  Universitas Pakuan
                </span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#ffc107] text-[#362175]">
              Terproteksi
            </span>
          </div>

          <form onSubmit={unlockHandler} className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-extrabold text-gray-800">
                Tautan Dilindungi Kata Sandi
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                Masukkan kode rahasia untuk membuka dan melanjutkan ke halaman
                tujuan.
              </p>
            </div>

            <div className="bg-[#49318f]/5 border border-[#49318f]/15 rounded-2xl px-4 py-3 text-center">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                Tujuan Tautan
              </p>
              <p className="text-base font-extrabold text-[#49318f] break-all">
                unpak.link/{shorturl ?? "---"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Kode Rahasia / Kata Sandi
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Masukkan kata sandi..."
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3.5 pr-11 focus:outline-none focus:ring-2 focus:ring-[#49318f]/20 focus:border-[#49318f] text-sm font-medium text-gray-800 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-[#49318f] transition cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={unlocking}
              className="w-full bg-[#49318f] hover:bg-[#382278] disabled:bg-gray-300 text-white font-bold text-sm py-3.5 rounded-xl transition shadow-md cursor-pointer"
            >
              {unlocking ? "Memverifikasi..." : "Buka Tautan"}
            </button>
          </form>

          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center text-xs text-gray-400 font-medium">
            © unpak.link — BPSI Universitas Pakuan
          </div>
        </div>
      </div>
    );
  }

  // ================= 3. EXPIRED LINK ======================
  if (isExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#362175] via-[#49318f] to-[#6c53b4] flex flex-col items-center justify-center px-4 py-10 font-montserrat">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          {/* Top Purple Banner */}
          <div className="bg-[#49318f] px-8 py-6 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <img
                src={Logo}
                alt="Logo UNPAK"
                className="w-10 h-10 object-contain bg-white/10 p-1.5 rounded-xl border border-white/15"
              />
              <div>
                <span className="text-white font-extrabold text-lg tracking-wide block leading-none">
                  unpak.link
                </span>
                <span className="text-purple-200 text-[11px] font-medium">
                  Universitas Pakuan
                </span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-rose-500 text-white">
              Kedaluwarsa
            </span>
          </div>

          {/* Main Content */}
          <div className="p-8 sm:p-10 text-center space-y-6">
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200">
                Masa Aktif Tautan Telah Berakhir
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 mt-4">
                Tautan Sudah Kedaluwarsa
              </h1>
              <div className="w-16 h-1.5 bg-[#ffc107] mx-auto rounded-full mt-3"></div>
            </div>

            <p className="text-sm text-gray-500 leading-relaxed">
              Batas waktu akses untuk tautan pendek ini telah berakhir. Silakan
              hubungi pembuat tautan atau penyelenggara kegiatan apabila Anda
              masih memerlukan akses ke halaman ini.
            </p>

            {/* Shortlink & Schedule Details */}
            <div className="bg-[#49318f]/5 border border-[#49318f]/15 rounded-2xl p-4 space-y-2.5 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#49318f]/10 pb-2.5">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Tautan Pendek
                </span>
                <span className="text-sm sm:text-base font-extrabold text-[#49318f] break-all">
                  unpak.link/{shorturl ?? "---"}
                </span>
              </div>
              {endDate && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Berakhir Pada
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-rose-600">
                    {formatDateIndo(endDate)} WIB
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                to="/"
                className="flex-1 bg-[#49318f] hover:bg-[#382278] text-white font-bold text-sm py-3.5 px-6 rounded-xl transition shadow-md text-center"
              >
                Kembali ke Beranda
              </Link>
              <a
                href="https://www.unpak.ac.id"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 border border-gray-200 hover:border-[#49318f]/40 hover:bg-gray-50 text-gray-700 font-bold text-sm py-3.5 px-6 rounded-xl transition text-center"
              >
                Portal UNPAK
              </a>
            </div>
          </div>

          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center text-xs text-gray-400 font-medium">
            © unpak.link — Bagian Perencanaan & Sistem Informasi (BPSI)
            Universitas Pakuan
          </div>
        </div>
      </div>
    );
  }

  // ================= 4. WAITING / COUNTDOWN ======================
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#362175] via-[#49318f] to-[#6c53b4] flex flex-col items-center justify-center px-4 py-10 font-montserrat">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
        {/* Top Purple Banner */}
        <div className="bg-[#49318f] px-8 py-6 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src={Logo}
              alt="Logo UNPAK"
              className="w-10 h-10 object-contain bg-white/10 p-1.5 rounded-xl border border-white/15"
            />
            <div>
              <span className="text-white font-extrabold text-lg tracking-wide block leading-none">
                unpak.link
              </span>
              <span className="text-purple-200 text-[11px] font-medium">
                Universitas Pakuan
              </span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#ffc107] text-[#362175]">
            Segera Dibuka
          </span>
        </div>

        <div className="p-8 sm:p-10 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">
              Tautan Belum Dapat Diakses
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Tautan ini dijadwalkan untuk dibuka sesuai waktu hitung mundur di
              bawah ini. Halaman akan dialihkan secara otomatis saat waktu
              dimulai.
            </p>
          </div>

          {/* Countdown Boxes */}
          {timeLeft && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Hari", value: format(timeLeft.days) },
                { label: "Jam", value: format(timeLeft.hours) },
                { label: "Menit", value: format(timeLeft.minutes) },
                { label: "Detik", value: format(timeLeft.seconds) },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-[#49318f] text-white rounded-2xl py-4 px-2 shadow-md border-b-4 border-[#ffc107]"
                >
                  <div className="text-2xl sm:text-3xl font-black tracking-tight">
                    {item.value}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-200 font-bold mt-1">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-[#49318f]/5 border border-[#49318f]/15 rounded-2xl p-4 space-y-2 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#49318f]/10 pb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Tautan Pendek
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[#49318f] break-all">
                unpak.link/{shorturl ?? "---"}
              </span>
            </div>
            {startDate && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Jadwal Dibuka
                </span>
                <span className="text-xs sm:text-sm font-bold text-gray-700">
                  {formatDateIndo(startDate)} WIB
                </span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Link
              to="/"
              className="inline-block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm py-3.5 px-6 rounded-xl transition"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>

        <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center text-xs text-gray-400 font-medium">
          © unpak.link — Bagian Perencanaan & Sistem Informasi (BPSI)
          Universitas Pakuan
        </div>
      </div>
    </div>
  );
}
