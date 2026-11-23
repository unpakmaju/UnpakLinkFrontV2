import { useState, useRef, useEffect, useMemo } from "react";
import {
  Calendar,
  ChevronDown,
  Search,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/Providers/AuthProvider";
import { useToast } from "@/Providers/ToastProvider";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";

import {
  getBrowser,
  getBrowserIcon,
  getVisitorIP,
} from "@/lib/utils";
import GeoCountryMap from "@/Components/GeoCountryMap";
import countries from "i18n-iso-countries";
import idLocale from "i18n-iso-countries/langs/id.json";

countries.registerLocale(idLocale);

const BASEAPI = import.meta.env.VITE_BASEAPI;
const BASEURL = import.meta.env.VITE_BASEURL || "https://unpak.link";

export default function Dashboard() {
  const { addToast } = useToast();
  const getNDaysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  };

  const getToday = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState(getNDaysAgo(7));
  const [endDate, setEndDate] = useState(getToday());
  const { getValidToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [datas, setDatas] = useState([]);

  const dateRef = useRef(null);
  const [selectedLinks, setSelectedLinks] = useState([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [showTopLines, setShowTopLines] = useState(true);
  const [tablePage, setTablePage] = useState(1);
  const tablePageSize = 10;

  // Palet warna kontras & modern untuk garis link
  const palette = [
    "#2563EB", // blue
    "#10B981", // emerald
    "#F59E0B", // amber
    "#EC4899", // pink
    "#06B6D4", // cyan
    "#EF4444", // red
    "#8B5CF6", // violet
    "#F97316", // orange
    "#14B8A6", // teal
    "#6366F1", // indigo
  ];

  // =======================
  // FILTER DATA BY DATE
  // =======================
  const filteredByDate = useMemo(() => {
    return datas.filter((item) => {
      const dateStr = item.CreatedDate || item.Created?.split("T")[0] || "";
      return (
        (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate)
      );
    });
  }, [datas, startDate, endDate]);

  // =======================
  // STATISTIK PER LINK (RANKED)
  // =======================
  const linkStatsList = useMemo(() => {
    const map = {};
    const totalAll = filteredByDate.length || 1;

    filteredByDate.forEach((item) => {
      const slug = item.LinkShort || "unknown";
      if (!map[slug]) {
        map[slug] = {
          slug,
          longUrl: item.LinkLong || "",
          clicks: 0,
          ips: new Set(),
          browsers: {},
          lastVisit: item.Created || "",
        };
      }
      map[slug].clicks += 1;
      map[slug].ips.add(getVisitorIP(item));
      const b = getBrowser(item.UserAgent);
      map[slug].browsers[b] = (map[slug].browsers[b] || 0) + 1;
      if (item.Created && item.Created > map[slug].lastVisit) {
        map[slug].lastVisit = item.Created;
      }
    });

    return Object.values(map)
      .map((entry) => {
        const topBrowser =
          Object.entries(entry.browsers).sort((a, b) => b[1] - a[1])[0]?.[0] ||
          "Other";
        return {
          slug: entry.slug,
          longUrl: entry.longUrl,
          clicks: entry.clicks,
          uniqueVisitors: entry.ips.size,
          share: ((entry.clicks / totalAll) * 100).toFixed(1),
          topBrowser,
          lastVisit: entry.lastVisit,
        };
      })
      .sort((a, b) => b.clicks - a.clicks);
  }, [filteredByDate]);

  const linkList = useMemo(
    () => linkStatsList.map((item) => item.slug),
    [linkStatsList],
  );

  // Mapping link ke warna konsisten berdasarkan peringkat
  const linkColors = useMemo(() => {
    const map = {};
    linkList.forEach((link, i) => {
      map[link] = palette[i % palette.length];
    });
    return map;
  }, [linkList]);

  // Link yang ditampilkan sebagai garis di grafik Visitor Timeline:
  // Jika user memilih checkbox link -> tampilkan link yang dipilih.
  // Jika belum memilih -> otomatis tampilkan Top 5 link terpopuler (jika showTopLines aktif).
  const activeChartLinks = useMemo(() => {
    if (selectedLinks.length > 0) return selectedLinks;
    if (showTopLines) return linkList.slice(0, 5);
    return [];
  }, [selectedLinks, showTopLines, linkList]);

  // =======================
  // FILTER BY SELECTED LINKS
  // =======================
  const filteredData = useMemo(() => {
    if (selectedLinks.length === 0) return filteredByDate;
    return filteredByDate.filter((d) => selectedLinks.includes(d.LinkShort));
  }, [filteredByDate, selectedLinks]);

  const toggleLink = (link) => {
    setSelectedLinks((prev) =>
      prev.includes(link) ? prev.filter((l) => l !== link) : [...prev, link],
    );
    setTablePage(1);
  };

  // =======================
  // CLOSE DATE PICKER WHEN CLICK OUTSIDE
  // =======================
  useEffect(() => {
    function handleClickOutside(e) {
      if (dateRef.current && !dateRef.current.contains(e.target)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // =======================
  // LOAD DATA SSE WITH PROGRESSIVE UPDATES & CLEANUP
  // =======================
  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("mode", "sse");
        if (startDate && endDate) {
          queryParams.set(
            "filters",
            `created_at:gte:${startDate}T00:00:00Z;created_at:lte:${endDate}T23:59:59Z`,
          );
        }
        const res = await fetch(`${BASEAPI}/clicks?${queryParams.toString()}`, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${getValidToken()}`,
          },
          signal: controller.signal,
        });

        if (res.status >= 400) {
          const text = await res.text();
          let body;
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
          if (
            body?.code === "Link.Validation" &&
            typeof body?.message === "object"
          ) {
            const messages = Object.values(body.message).flat().join("\n");
            addToast("error", messages);
            return;
          }
          if (typeof body === "string") {
            addToast("error", body);
            return;
          }
          addToast("error", body?.message || "Terjadi kesalahan pada server");
          return;
        }

        if (!res.body) throw new Error("SSE not supported by browser");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        const result = [];
        let lastUpdate = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index;
          let hasNewData = false;
          while ((index = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 2);

            if (!rawEvent.startsWith("data:")) continue;
            const payload = rawEvent.replace(/^data:\s*/, "");
            if (!payload || payload === "start" || payload === "done") continue;

            try {
              const parsed = JSON.parse(payload);
              parsed.CreatedTime = new Date(parsed.Created).getTime();
              parsed.CreatedDate = parsed.Created.split("T")[0];
              result.push(parsed);
              hasNewData = true;
            } catch (err) {
              console.error("JSON parse error:", payload);
            }
          }

          if (hasNewData && Date.now() - lastUpdate > 1500) {
            setDatas([...result]);
            lastUpdate = Date.now();
          }
        }

        setDatas(result);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("SSE error:", err);
          addToast("error", "Ada masalah pada aplikasi");
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();

    return () => {
      controller.abort();
    };
  }, [startDate, endDate]);

  // =======================
  // TIMELINE DATA (DENGAN DETAIL BREAKDOWN PER HARI)
  // =======================
  const timelineData = useMemo(() => {
    const map = {};
    const sourceData =
      selectedLinks.length > 0 ? filteredData : filteredByDate;

    sourceData.forEach((item) => {
      const date = item.CreatedDate || item.Created.split("T")[0];
      const link = item.LinkShort || "unknown";

      if (!map[date]) {
        map[date] = {
          date,
          total: 0,
          _ips: new Set(),
          _breakdown: {},
        };
      }

      map[date].total += 1;
      map[date]._ips.add(getVisitorIP(item));
      map[date]._breakdown[link] = (map[date]._breakdown[link] || 0) + 1;
      map[date][link] = (map[date][link] || 0) + 1;
    });

    Object.values(map).forEach((row) => {
      row.uniqueVisitors = row._ips.size;
      activeChartLinks.forEach((link) => {
        if (row[link] === undefined) row[link] = 0;
      });
    });

    return Object.values(map).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
  }, [filteredByDate, filteredData, selectedLinks, activeChartLinks]);

  // =======================
  // KPI METRICS
  // =======================
  const kpiMetrics = useMemo(() => {
    const totalClicks = filteredData.length;
    const uniqueIPs = new Set(filteredData.map(getVisitorIP)).size;
    const activeLinksCount = new Set(filteredData.map((d) => d.LinkShort)).size;
    const daysCount = Math.max(timelineData.length, 1);
    const avgPerDay = Math.round(totalClicks / daysCount);

    // Top link in current view
    const sourceRanks =
      selectedLinks.length > 0
        ? linkStatsList.filter((l) => selectedLinks.includes(l.slug))
        : linkStatsList;
    const topLink = sourceRanks[0] || null;

    return {
      totalClicks,
      uniqueIPs,
      activeLinksCount,
      avgPerDay,
      topLink,
    };
  }, [filteredData, timelineData, linkStatsList, selectedLinks]);

  // =======================
  // GEO DATA
  // =======================
  const geoData = useMemo(() => {
    const map = {};
    filteredData.forEach((item) => {
      let id = item.ISO || "ID";
      if (id === "Unknown" || id.trim() === "") {
        id = "ID";
      }
      if (!map[id]) map[id] = 0;
      map[id]++;
    });

    return Object.entries(map)
      .map(([id, value]) => ({
        id,
        name: countries.getName(id, "id") || countries.getName(id, "en") || id,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  // =======================
  // BROWSER DATA
  // =======================
  const browserData = useMemo(() => {
    const map = {};
    const total = filteredData.length || 1;
    filteredData.forEach((item) => {
      const browser = getBrowser(item.UserAgent);
      if (!map[browser]) map[browser] = 0;
      map[browser]++;
    });

    return Object.entries(map)
      .map(([browser, count]) => ({
        browser,
        total: count,
        percent: ((count / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredData]);

  // Filtered link list in right sidebar search
  const searchedLinkStats = useMemo(() => {
    if (!linkSearch.trim()) return linkStatsList;
    const q = linkSearch.toLowerCase();
    return linkStatsList.filter(
      (item) =>
        item.slug.toLowerCase().includes(q) ||
        item.longUrl?.toLowerCase().includes(q),
    );
  }, [linkStatsList, linkSearch]);

  // Table pagination for detailed link stats
  const displayedTableLinks = useMemo(() => {
    const base =
      selectedLinks.length > 0
        ? linkStatsList.filter((item) => selectedLinks.includes(item.slug))
        : linkStatsList;
    return base;
  }, [linkStatsList, selectedLinks]);

  const totalTablePages =
    Math.ceil(displayedTableLinks.length / tablePageSize) || 1;
  const paginatedTableLinks = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return displayedTableLinks.slice(start, start + tablePageSize);
  }, [displayedTableLinks, tablePage]);

  const formatDateTimeShort = (isoStr) => {
    if (!isoStr) return "-";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  const LocalLoader = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-3">
      <div className="w-8 h-8 border-4 border-[#49318f]/20 border-t-[#49318f] rounded-full animate-spin"></div>
      <p className="text-xs text-gray-500 animate-pulse">
        Memuat data statistik...
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ================= PAGE HEADER & DATE FILTER ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pantau statistik klik dan data pengunjung UnpakLink secara realtime.
          </p>
        </div>

        {/* DATE FILTER */}
        <div
          ref={dateRef}
          className="relative w-full md:w-auto md:min-w-[240px]"
        >
          <button
            onClick={() => setShowDatePicker((prev) => !prev)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between w-full hover:bg-gray-50 transition shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-2.5 text-gray-700 text-sm">
              <Calendar size={16} className="text-[#49318f]" />
              <span className="font-semibold">
                {startDate && endDate
                  ? `${startDate} s/d ${endDate}`
                  : !startDate && !endDate
                    ? "Semua Rentang Waktu"
                    : "Pilih Rentang Tanggal"}
              </span>
            </div>
            <ChevronDown
              size={16}
              className={`text-gray-400 transition-transform ${showDatePicker ? "rotate-180" : ""}`}
            />
          </button>

          {showDatePicker && (
            <div className="absolute right-0 z-50 mt-2 w-full md:w-80 bg-white border border-gray-100 rounded-2xl shadow-xl p-4 animate-in fade-in zoom-in-95">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 border-b border-gray-100 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(getToday());
                      setEndDate(getToday());
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      startDate === getToday() && endDate === getToday()
                        ? "bg-[#49318f]/10 text-[#49318f] border-[#49318f]/30"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(getNDaysAgo(1));
                      setEndDate(getToday());
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      startDate === getNDaysAgo(1) && endDate === getToday()
                        ? "bg-[#49318f]/10 text-[#49318f] border-[#49318f]/30"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Kemarin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(getNDaysAgo(7));
                      setEndDate(getToday());
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      startDate === getNDaysAgo(7) && endDate === getToday()
                        ? "bg-[#49318f]/10 text-[#49318f] border-[#49318f]/30"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    7 Hari Terakhir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(getNDaysAgo(30));
                      setEndDate(getToday());
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      startDate === getNDaysAgo(30) && endDate === getToday()
                        ? "bg-[#49318f]/10 text-[#49318f] border-[#49318f]/30"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    30 Hari Terakhir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                    }}
                    className={`col-span-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      !startDate && !endDate
                        ? "bg-[#49318f]/10 text-[#49318f] border-[#49318f]/30"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Semua Rentang Waktu (All Time)
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate && e.target.value > endDate) setEndDate("");
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#49318f]/20 focus:border-[#49318f]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    End Date
                  </label>
                  <input
                    type="date"
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#49318f]/20 focus:border-[#49318f]"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 bg-[#49318f] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#382278] transition shadow-sm cursor-pointer"
                  >
                    Terapkan
                  </button>
                  <button
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= 4 KPI SUMMARY CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Klik */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Total Kunjungan (Klik)
          </p>
          <h3 className="text-3xl font-extrabold text-gray-800 mt-1.5">
            {kpiMetrics.totalClicks.toLocaleString("id-ID")}
          </h3>
          <p className="text-xs text-gray-500 font-medium mt-2">
            Rata-rata {kpiMetrics.avgPerDay.toLocaleString("id-ID")} klik / hari
          </p>
        </div>

        {/* Card 2: Unique Visitors */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Pengunjung Unik (IP)
          </p>
          <h3 className="text-3xl font-extrabold text-gray-800 mt-1.5">
            {kpiMetrics.uniqueIPs.toLocaleString("id-ID")}
          </h3>
          <p className="text-xs text-gray-500 font-medium mt-2">
            {kpiMetrics.uniqueIPs > 0
              ? `${(kpiMetrics.totalClicks / kpiMetrics.uniqueIPs).toFixed(1)}x rata-rata kunjungan / IP`
              : "Belum ada pengunjung"}
          </p>
        </div>

        {/* Card 3: Total Link Aktif Terklik */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Link Memiliki Trafik
          </p>
          <h3 className="text-3xl font-extrabold text-gray-800 mt-1.5">
            {kpiMetrics.activeLinksCount.toLocaleString("id-ID")}
          </h3>
          <p className="text-xs text-gray-500 font-medium mt-2">
            {selectedLinks.length > 0
              ? `${selectedLinks.length} link sedang difilter`
              : `Dari total ${linkList.length} link terdeteksi`}
          </p>
        </div>

        {/* Card 4: Link Terpopuler (#1) */}
        <div className="bg-[#49318f] text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-200">
              Link Terpopuler (#1)
            </span>
            {kpiMetrics.topLink && (
              <span className="text-[11px] font-bold bg-white/15 px-2.5 py-0.5 rounded-full text-white">
                {kpiMetrics.topLink.share}% trafik
              </span>
            )}
          </div>
          {kpiMetrics.topLink ? (
            <div className="mt-2">
              <p
                className="text-lg font-extrabold truncate text-white"
                title={`unpak.link/${kpiMetrics.topLink.slug}`}
              >
                unpak.link/{kpiMetrics.topLink.slug}
              </p>
              <div className="flex items-center justify-between mt-2 text-xs text-purple-100">
                <span className="font-bold text-cyan-300">
                  {kpiMetrics.topLink.clicks.toLocaleString("id-ID")} klik
                </span>
                <span>
                  {kpiMetrics.topLink.uniqueVisitors.toLocaleString("id-ID")} IP
                  unik
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-purple-200 italic mt-3">
              Belum ada data link
            </p>
          )}
        </div>
      </div>

      {/* ================= MAIN CONTENT GRID (TIMELINE + LINK RANKING FILTER) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ================= LEFT COLUMN: VISITOR TIMELINE & DEMOGRAPHICS (8 COLS) ================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* VISITOR TIMELINE CHART */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-[#49318f] rounded-full"></span>
                  Visitor Timeline & Breakdown Link
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Arahkan kursor pada titik tanggal untuk melihat rincian nama
                  link dan jumlah pengunjung di hari tersebut.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {selectedLinks.length === 0 && linkList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTopLines((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      showTopLines
                        ? "bg-[#49318f]/10 text-[#49318f] border-[#49318f]/30"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {showTopLines
                      ? "Garis Top 5 Link: Aktif"
                      : "Tampilkan Garis Top 5 Link"}
                  </button>
                )}
                {selectedLinks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLinks([])}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                  >
                    Reset Filter ({selectedLinks.length})
                  </button>
                )}
              </div>
            </div>

            {datas.length === 0 && loading ? (
              <LocalLoader />
            ) : timelineData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[340px] text-gray-400 space-y-1">
                <p className="font-semibold text-gray-500">
                  Tidak ada data statistik pada rentang waktu ini
                </p>
                <p className="text-xs">
                  Coba pilih rentang waktu yang lain atau buat klik baru
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart
                  data={timelineData}
                  margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient
                      id="colorTotalClicks"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#49318f"
                        stopOpacity={0.22}
                      />
                      <stop offset="95%" stopColor="#49318f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      });
                    }}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                    minTickGap={20}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 12, zIndex: 0 }}
                    formatter={(value) =>
                      value === "Total Klik" ? (
                        <span className="font-bold text-[#49318f]">
                          Total Klik
                        </span>
                      ) : (
                        <span className="font-medium text-gray-700">
                          /{value}
                        </span>
                      )
                    }
                  />
                  <Tooltip
                    wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
                    content={({ active, label }) => {
                      if (!active || !label) return null;
                      const dayRow = timelineData.find((d) => d.date === label);
                      if (!dayRow) return null;

                      const breakdownEntries = Object.entries(
                        dayRow._breakdown || {},
                      ).sort((a, b) => b[1] - a[1]);
                      const topEntries = breakdownEntries.slice(0, 6);
                      const remainingCount =
                        breakdownEntries.length - topEntries.length;

                      return (
                        <div className="bg-white p-4 border border-gray-200 rounded-2xl shadow-2xl text-xs space-y-2.5 min-w-[260px] max-w-[330px] relative z-[9999]">
                          {/* Tanggal & Ringkasan Hari Itu */}
                          <div className="border-b border-gray-100 pb-2">
                            <div className="font-extrabold text-gray-800 text-sm">
                              {new Date(label).toLocaleDateString("id-ID", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </div>
                            <div className="flex items-center justify-between mt-1.5 bg-[#49318f]/5 px-2.5 py-1.5 rounded-lg">
                              <span className="font-bold text-[#49318f]">
                                Total Klik:
                              </span>
                              <span className="font-extrabold text-sm text-[#49318f]">
                                {dayRow.total.toLocaleString("id-ID")} klik (
                                {dayRow.uniqueVisitors} IP)
                              </span>
                            </div>
                          </div>

                          {/* Rincian Link yang Diklik pada Tanggal Ini */}
                          <div className="space-y-1.5">
                            <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                              Rincian Link Diklik ({breakdownEntries.length}{" "}
                              link):
                            </div>
                            {topEntries.map(([slug, count]) => {
                              const pct =
                                dayRow.total > 0
                                  ? Math.round((count / dayRow.total) * 100)
                                  : 0;
                              const dotColor = linkColors[slug] || "#64748b";
                              return (
                                <div
                                  key={slug}
                                  className="flex items-center justify-between gap-3 py-0.5"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: dotColor }}
                                    ></span>
                                    <span className="text-gray-700 font-semibold truncate">
                                      /{slug}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-extrabold text-gray-900">
                                      {count.toLocaleString("id-ID")}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-medium">
                                      ({pct}%)
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {remainingCount > 0 && (
                              <div className="text-[11px] text-gray-400 italic pt-1 border-t border-gray-50">
                                + {remainingCount} link lainnya pada tanggal ini
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#49318f"
                    fillOpacity={1}
                    fill="url(#colorTotalClicks)"
                    strokeWidth={3}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                    name="Total Klik"
                  />
                  {activeChartLinks.map((link) => (
                    <Line
                      key={link}
                      type="monotone"
                      dataKey={link}
                      stroke={linkColors[link]}
                      strokeWidth={2.2}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 5 }}
                      name={link}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ================= GEO + BROWSER (1 ROW) ================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* GEO MAP */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-[#06b6d4] rounded-full"></span>
                    Top Country
                  </h2>
                </div>

                {/* Top Country Badges */}
                {geoData.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {geoData.slice(0, 4).map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-cyan-50 text-cyan-800 border border-cyan-100"
                      >
                        <span>{c.name}</span>
                        <span className="bg-white px-1.5 py-0.2 rounded-md text-cyan-700 shadow-2xs">
                          {c.value.toLocaleString("id-ID")}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {datas.length === 0 && loading ? (
                <LocalLoader />
              ) : geoData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[320px] text-gray-400 space-y-1 border border-dashed border-gray-100 rounded-2xl">
                  <p className="font-semibold text-gray-500">
                    Tidak ada data lokasi
                  </p>
                </div>
              ) : (
                <GeoCountryMap data={geoData} />
              )}
            </div>

            {/* BROWSER USAGE */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-[#ffc107] rounded-full"></span>
                    Browser Usage
                  </h2>
                </div>

                {/* Browser Detail List */}
                {browserData.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {browserData.slice(0, 4).map((b) => (
                      <div
                        key={b.browser}
                        className="flex items-center justify-between bg-gray-50/80 border border-gray-100 px-3 py-2 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 font-semibold text-gray-700 truncate">
                          {getBrowserIcon(b.browser)}
                          <span className="truncate">{b.browser}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-gray-900">
                            {b.total.toLocaleString("id-ID")}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-1">
                            ({b.percent}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {datas.length === 0 && loading ? (
                <LocalLoader />
              ) : browserData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[280px] text-gray-400 space-y-1 border border-dashed border-gray-100 rounded-2xl">
                  <p className="font-semibold text-gray-500">
                    Tidak ada data browser
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    layout="vertical"
                    data={browserData}
                    margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="browser"
                      width={90}
                      tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                          <foreignObject
                            width="85"
                            height="28"
                            x="-85"
                            y="-14"
                          >
                            <div className="flex items-center justify-end gap-1.5 pr-2 w-full h-full text-xs font-semibold text-gray-700">
                              {getBrowserIcon(payload.value)}
                              <span className="truncate">{payload.value}</span>
                            </div>
                          </foreignObject>
                        </g>
                      )}
                    />
                    <Tooltip
                      formatter={(value, _name, props) => [
                        `${Number(value).toLocaleString("id-ID")} klik (${props.payload.percent}%)`,
                        props.payload.browser,
                      ]}
                    />
                    <Bar
                      dataKey="total"
                      fill="#ffc107"
                      radius={[0, 6, 6, 0]}
                      name="Total Klik"
                    >
                      {browserData.map((entry, idx) => (
                        <Cell
                          key={entry.browser}
                          fill={idx === 0 ? "#49318f" : "#f59e0b"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: FILTER & PERINGKAT LINK (4 COLS) ================= */}
        <div className="lg:col-span-4 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col lg:max-h-[910px]">
          <div className="border-b border-gray-100 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <span className="w-1.5 h-5 bg-[#49318f] rounded-full"></span>
                Peringkat & Filter Link
              </h2>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#49318f]/10 text-[#49318f]">
                {linkList.length} Link
              </span>
            </div>

            <p className="text-xs text-gray-500">
              Centang link di bawah untuk memfokuskan grafik dan statistik pada
              link tertentu:
            </p>

            {/* Search Input Inside Filter Link */}
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:bg-white focus-within:border-[#49318f] transition">
              <Search size={15} className="text-gray-400 shrink-0" />
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Cari shortlink dan jumlah klik..."
                className="ml-2 w-full text-xs text-gray-700 bg-transparent outline-none"
              />
            </div>

            {/* Quick Filter Actions */}
            {linkList.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedLinks(linkList.slice(0, 5))}
                  className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold bg-[#49318f]/10 text-[#49318f] hover:bg-[#49318f]/20 transition cursor-pointer"
                >
                  Pilih Top 5 Link
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLinks([])}
                  disabled={selectedLinks.length === 0}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition cursor-pointer"
                >
                  Semua
                </button>
              </div>
            )}
          </div>

          {/* LINK LIST WITH VISITOR COUNTS & PROGRESS BARS */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 mt-4">
            {datas.length === 0 && loading && <LocalLoader />}
            {!(datas.length === 0 && loading) &&
              searchedLinkStats.length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-8">
                  Tidak ada link ditemukan
                </p>
              )}
            {!(datas.length === 0 && loading) &&
              searchedLinkStats.map((item) => {
                const rank =
                  linkStatsList.findIndex((l) => l.slug === item.slug) + 1;
                const isSelected = selectedLinks.includes(item.slug);
                const isOnChart = activeChartLinks.includes(item.slug);
                const color = linkColors[item.slug] || "#49318f";

                return (
                  <label
                    key={item.slug}
                    className={`block p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "border-[#49318f] bg-[#49318f]/5 shadow-2xs"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleLink(item.slug)}
                          className="accent-[#49318f] rounded w-4 h-4 shrink-0 cursor-pointer"
                        />
                        <span className="text-[11px] font-extrabold text-gray-400 w-5 shrink-0">
                          #{rank}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isOnChart ? color : "#cbd5e1",
                          }}
                          title={
                            isOnChart
                              ? "Ditampilkan di grafik"
                              : "Centang untuk tampilkan di grafik"
                          }
                        ></span>
                        <span
                          className={`text-xs sm:text-sm truncate ${
                            isSelected
                              ? "font-extrabold text-[#49318f]"
                              : "font-semibold text-gray-700"
                          }`}
                          title={`unpak.link/${item.slug}`}
                        >
                          {item.slug}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-[#49318f]/10 text-[#49318f]">
                          {item.clicks.toLocaleString("id-ID")} klik
                        </span>
                      </div>
                    </div>

                    {/* Sub-info & Mini Progress Bar */}
                    <div className="mt-2 pl-6 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>
                          {item.uniqueVisitors.toLocaleString("id-ID")} IP unik
                        </span>
                        <span className="font-semibold text-gray-500">
                          {item.share}% dari total trafik
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(Number(item.share), 3)}%`,
                            backgroundColor: color,
                          }}
                        ></div>
                      </div>
                    </div>
                  </label>
                );
              })}
          </div>
        </div>
      </div>

      {/* ================= TABEL DETAIL ANALITIK PER LINK ================= */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4">
          <div>
            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
              <span className="w-1.5 h-5 bg-[#10B981] rounded-full"></span>
              Tabel Detail Kunjungan Per Link
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Daftar lengkap performa setiap shortlink beserta jumlah klik,
              pengunjung unik, browser dominan, dan waktu kunjungan terakhir.
            </p>
          </div>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            Menampilkan {displayedTableLinks.length} Link
          </span>
        </div>

        {datas.length === 0 && loading ? (
          <LocalLoader />
        ) : displayedTableLinks.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm italic">
            Belum ada data kunjungan link pada periode ini.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider bg-gray-50/60">
                    <th className="py-3 px-4 rounded-tl-xl w-14">Rank</th>
                    <th className="py-3 px-4">Shortlink</th>
                    <th className="py-3 px-4 text-right">Total Klik</th>
                    <th className="py-3 px-4 text-right">Pengunjung Unik</th>
                    <th className="py-3 px-4">Proporsi Trafik</th>
                    <th className="py-3 px-4">Top Browser</th>
                    <th className="py-3 px-4 rounded-tr-xl text-right">
                      Kunjungan Terakhir
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {paginatedTableLinks.map((item, idx) => {
                    const globalRank =
                      (tablePage - 1) * tablePageSize + idx + 1;
                    const color = linkColors[item.slug] || "#49318f";
                    return (
                      <tr
                        key={item.slug}
                        onClick={() => toggleLink(item.slug)}
                        className={`transition cursor-pointer ${
                          selectedLinks.includes(item.slug)
                            ? "bg-[#49318f]/5"
                            : "hover:bg-gray-50/80"
                        }`}
                      >
                        <td className="py-3.5 px-4 font-extrabold text-gray-400 text-xs">
                          #{globalRank}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            ></span>
                            <div>
                              <div className="font-bold text-[#49318f] flex items-center gap-1.5">
                                <span>unpak.link/{item.slug}</span>
                                <a
                                  href={`${BASEURL}/${item.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-gray-400 hover:text-[#49318f] transition"
                                  title="Buka shortlink di tab baru"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              </div>
                              {item.longUrl && (
                                <p className="text-xs text-gray-400 truncate max-w-xs sm:max-w-md">
                                  {item.longUrl}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-extrabold text-gray-800 text-base">
                            {item.clicks.toLocaleString("id-ID")}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-gray-600">
                          {item.uniqueVisitors.toLocaleString("id-ID")} IP
                        </td>
                        <td className="py-3.5 px-4 min-w-[150px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(Number(item.share), 3)}%`,
                                  backgroundColor: color,
                                }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold text-gray-600 w-12 text-right">
                              {item.share}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-700">
                            {getBrowserIcon(item.topBrowser)}
                            <span>{item.topBrowser}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right text-xs text-gray-500 font-medium">
                          <span>{formatDateTimeShort(item.lastVisit)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Tabel Detail */}
            {totalTablePages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-xs text-gray-600">
                <span>
                  Halaman <b>{tablePage}</b> dari <b>{totalTablePages}</b>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={tablePage === 1}
                    onClick={() => setTablePage((p) => Math.max(p - 1, 1))}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={tablePage === totalTablePages}
                    onClick={() =>
                      setTablePage((p) => Math.min(p + 1, totalTablePages))
                    }
                    className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
