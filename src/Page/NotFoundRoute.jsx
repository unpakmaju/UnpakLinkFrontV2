import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "@/assets/logo.svg";
import Img1 from "@/assets/img-1.svg";

export default function NotFoundRoute() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    document.title = "404 Halaman Tidak Ditemukan — UnpakLink";
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/", { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const progressPct = ((5 - countdown) / 5) * 100;

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
                    Unpak Shorter Link
                  </span>
                  <span className="block text-sm text-white/80 font-light">
                    Sivitas Akademika Universitas Pakuan
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-6xl sm:text-7xl lg:text-8xl font-extrabold leading-none tracking-tight text-cyan-400">
                  404
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
                  Halaman Tidak Ditemukan
                </h1>
                <p className="text-sm sm:text-base font-light text-white/85 leading-relaxed max-w-xl mx-auto lg:mx-0">
                  Halaman atau rute yang Anda tuju tidak tersedia di sistem
                  UnpakLink. Silakan periksa kembali alamat URL yang Anda
                  masukkan.
                </p>
              </div>

              <div className="bg-white/10 border border-white/15 rounded-2xl p-4 max-w-md mx-auto lg:mx-0 space-y-2.5">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-white/85 font-light">
                    Otomatis kembali ke halaman utama dalam:
                  </span>
                  <span className="font-extrabold text-cyan-400 text-base">
                    {countdown} detik
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progressPct}%` }}
                  ></div>
                </div>
              </div>

              <div className="pt-1">
                <Link
                  to="/"
                  replace
                  className="inline-block bg-cyan-400 text-[#49318f] px-8 py-3.5 rounded-full font-bold text-sm hover:bg-cyan-300 transition-all duration-300 shadow-lg"
                >
                  Ke Halaman Utama Sekarang
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <img
                src={Img1}
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
