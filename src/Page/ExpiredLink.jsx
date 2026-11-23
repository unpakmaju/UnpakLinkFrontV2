import { useEffect } from "react";
import { Link } from "react-router-dom";
import Logo from "@/assets/logo-unpak.webp";
import Img2 from "@/assets/img-2.svg";

export default function ExpiredLink() {
  useEffect(() => {
    document.title = "Tautan Kedaluwarsa";
  }, []);

  return (
    <div className="min-h-screen bg-[#6c53b4] flex items-center py-10 sm:py-16 font-montserrat">
      <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-14">
        <div className="bg-[#49318f] rounded-3xl px-6 sm:px-12 lg:px-16 py-10 sm:py-14 text-white shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-3">
                <img
                  src={Logo}
                  alt="Logo UNPAK"
                  className="w-14 sm:w-16 mx-auto lg:mx-0"
                />
                <div className="text-left">
                  <span className="block text-xs uppercase tracking-widest text-[#ffc107] font-bold">
                    Masa Aktif Berakhir
                  </span>
                  <span className="block text-sm text-white/80 font-light">
                    Sivitas Akademika Universitas Pakuan
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
                  Tautan Sudah Kedaluwarsa
                </h1>
                <p className="text-sm sm:text-base font-light text-white/85 leading-relaxed max-w-xl mx-auto lg:mx-0">
                  Batas waktu akses untuk tautan pendek ini telah berakhir.
                  Silakan hubungi pembuat tautan atau penyelenggara kegiatan
                  apabila Anda masih memerlukan akses ke halaman tujuan.
                </p>
              </div>

              <div className="pt-1">
                <Link
                  to="/"
                  className="inline-block bg-cyan-400 text-[#49318f] px-8 py-3.5 rounded-full font-bold text-sm hover:bg-cyan-300 transition-all duration-300 shadow-lg"
                >
                  Kembali ke Halaman Utama
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <img
                src={Img2}
                alt="Ilustrasi UnpakLink"
                className="w-60 sm:w-76 lg:w-full max-w-sm drop-shadow-xl"
              />
            </div>

            <div className="col-span-1 lg:col-span-12 pt-6 border-t border-white/15 mt-2 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-white/70">
              <span>
                © unpak.link — Bagian Perencanaan & Sistem Informasi (BPSI)
                Universitas Pakuan
              </span>
              <span className="font-semibold text-white/90">unpak.link</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
