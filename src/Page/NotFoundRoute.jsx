import { Link } from "react-router-dom";
import Logo from "@/assets/logo.svg";

export default function NotFoundRoute() {
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
              Halaman Tidak Ditemukan
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Maaf, halaman atau rute yang Anda cari tidak tersedia di sistem
              UnpakLink. Silakan periksa kembali alamat URL Anda.
            </p>
          </div>

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
