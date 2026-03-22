"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Loader2,
  Download,
  LogOut,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  LayoutDashboard,
  Search,
  Copy,
  Check,
  Phone,
  Mail,
  FileText,
  User,
  MapPin,
  Upload,
  Trash2,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";

type ConfigDetails = {
  files?: Array<{
    name: string;
    pages: number | null;
    printMode: "bw" | "color";
    duplex: boolean;
    copies: number;
  }>;
  spiralType?: string;
  spiralColor?: string;
  coverFrontColor?: string;
  coverBackColor?: string;
  /** Număr de fișiere per grup de legare (când există documente standalone + îndosarieri) */
  bindingGroupSizes?: number[];
  ramburs_confirmed?: boolean;
  /** Opțiuni spirală/coperți per grup */
  bindingOptions?: Array<{
    spiralType?: string;
    spiralColor?: string;
    coverFrontColor?: string;
    coverBackColor?: string;
  }>;
  /** Per comandă: [true/false] per fișier – bifat = document printat */
  printed_files?: boolean[];
};

type ChangeLogEntry = { email: string; what: string; created_at: string };

type OrderRow = {
  id: string;
  created_at: string;
  phone: string;
  customer_email: string;
  total_price: number;
  payment_method: string;
  status: string;
  file_url: string;
  config_details: ConfigDetails | null;
  change_logs?: unknown[];
  awb_url?: string | null;
  factura_url?: string | null;
  files_deleted_at?: string | null;
};

const STATUS_OPTIONS = ["Nou", "În lucru", "Gata"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

const FILTER_TABS = [
  { id: "all", label: "Toate" },
  { id: "Nou", label: "Noi" },
  { id: "În lucru", label: "În lucru" },
  { id: "Gata", label: "Finalizate" },
] as const;

type SortBy = "date" | "price" | "payment";

/** Returnează toate URL-urile fișierelor din file_url (JSON array sau URL unic). */
function getFileUrls(fileUrl: string): string[] {
  if (!fileUrl || typeof fileUrl !== "string") return [];
  const trimmed = fileUrl.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
    }
  } catch {
    // not JSON, use as single URL
  }
  return trimmed.startsWith("http") ? [trimmed] : [];
}

function getFirstFileUrl(fileUrl: string): string | null {
  const urls = getFileUrls(fileUrl);
  return urls.length > 0 ? urls[0] : null;
}

/** Formatează telefonul cu spații pentru lizibilitate (ex: 0712 345 678). */
function formatPhoneDisplay(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("07")) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 9 && digits.startsWith("7")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length >= 9) {
    return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  }
  return phone ?? "—";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function normalizeStatus(status: string): string {
  const s = status?.trim() || "";
  if (s === "pending" || s.toLowerCase() === "nou") return "Nou";
  if (s.toLowerCase() === "în lucru" || s === "in_lucru") return "În lucru";
  if (s.toLowerCase() === "gata" || s.toLowerCase() === "finalizat") return "Gata";
  return s || "Nou";
}

function formatConfigSummary(config: ConfigDetails | null): string {
  if (!config) return "—";
  const parts: string[] = [];
  const files = config.files ?? [];
  const groupSizes = config.bindingGroupSizes;
  const bindingOptions = config.bindingOptions ?? [];
  if (files.length === 0) {
    // Fără fișiere
  } else if (groupSizes && groupSizes.length > 0 && bindingOptions.length === groupSizes.length) {
    parts.push(`${groupSizes.length} grupuri (${files.length} fișiere)`);
    bindingOptions.forEach((opts, i) => {
      const spiral = opts?.spiralType && opts.spiralType !== "none" ? `Spirală ${i + 1}: ${opts.spiralType}` : null;
      if (spiral) parts.push(spiral);
    });
    if (parts.length === 1) parts.push("Spirală: per grup");
  } else if (files.length === 1) {
    const f = files[0];
    parts.push(f.printMode === "color" ? "Color: Da" : "Color: Nu");
    parts.push(f.duplex ? "Față-verso: Da" : "Față-verso: Nu");
    if (f.copies > 1) parts.push(`Copii: ${f.copies}`);
  } else {
    const fileSummaries = files.map((f) => {
      const color = f.printMode === "color" ? "Color" : "A-N";
      const fv = f.duplex ? "F-V" : "1 față";
      const copies = f.copies > 1 ? `, ${f.copies} copii` : "";
      const shortName = f.name.length > 18 ? `${f.name.slice(0, 15)}…` : f.name;
      return `${shortName}: ${color}, ${fv}${copies}`;
    });
    parts.push(fileSummaries.join(" · "));
  }
  if (!groupSizes || groupSizes.length === 0) {
    const spiral = config.spiralType;
    if (spiral && spiral !== "none") {
      const color = config.spiralColor ? `, ${config.spiralColor}` : "";
      const label =
        spiral === "plastic"
          ? `Spiralare plastică${color}`
          : spiral === "perforare2"
          ? "Perforare cu 2 găuri"
          : spiral === "capsare"
          ? "Capsare (maxim 240 coli)"
          : spiral;
      parts.push(`Legare: ${label}`);
    } else if (config.spiralType === "none" || !config.spiralType) {
      parts.push("Legare: Doar print");
    }
    if (config.coverFrontColor && config.coverFrontColor !== "transparent") {
      parts.push(`Copertă față: ${config.coverFrontColor}`);
    }
    if (config.coverBackColor && config.coverBackColor !== "transparent") {
      parts.push(`Copertă spate: ${config.coverBackColor}`);
    }
  }
  return parts.length ? parts.join(" · ") : "—";
}

/** O linie de configurare cu nivel de indentare (0 = titlu, 1 = sub-linie cu spațiu egal). */
type ConfigLine = { text: string; indent: 0 | 1 };

/** Returnează liniile de configurare cu indentare pentru afișare lizibilă. */
function formatConfigSummaryLines(config: ConfigDetails | null): ConfigLine[] {
  if (!config) return [{ text: "—", indent: 0 }];
  const parts: ConfigLine[] = [];
  const line = (text: string, indent: 0 | 1 = 0) => parts.push({ text, indent });
  const sub = (text: string) => parts.push({ text, indent: 1 });

  const files = config.files ?? [];
  const groupSizes = config.bindingGroupSizes;
  const bindingOptions = config.bindingOptions ?? [];

  if (files.length === 0) {
    // Fără fișiere
  } else if (groupSizes && groupSizes.length > 0 && bindingOptions.length === groupSizes.length) {
    let idx = 0;
    groupSizes.forEach((size, gi) => {
      if (gi > 0) parts.push({ text: "", indent: 0 }); // linie liberă între grupuri
      const groupFiles = files.slice(idx, idx + size);
      idx += size;
      const opts = bindingOptions[gi];
      const spiral = opts?.spiralType;
      const label =
        spiral && spiral !== "none"
          ? spiral === "plastic"
            ? `Spiralare plastică${opts?.spiralColor ? `, ${opts.spiralColor}` : ""}`
            : spiral === "perforare2"
            ? "Perforare cu 2 găuri"
            : spiral === "capsare"
            ? "Capsare (maxim 240 coli)"
            : spiral
          : "Doar print";
      line(`Grup ${gi + 1} (îndosariere): Legare: ${label}`);
      if (opts?.coverFrontColor && opts.coverFrontColor !== "transparent") {
        sub(`Copertă față: ${opts.coverFrontColor}`);
      }
      if (opts?.coverBackColor && opts.coverBackColor !== "transparent") {
        sub(`Copertă spate: ${opts.coverBackColor}`);
      }
      groupFiles.forEach((f, pos) => {
        const color = f.printMode === "color" ? "Color" : "A-N";
        const fv = f.duplex ? "F-V" : "1 față";
        const copies = f.copies > 1 ? `, ${f.copies} copii` : "";
        sub(`${pos + 1}. ${f.name}: ${color}, ${fv}${copies}`);
      });
    });
  } else if (files.length === 1) {
    const f = files[0];
    line(f.printMode === "color" ? "Color: Da" : "Color: Nu");
    line(f.duplex ? "Față-verso: Da" : "Față-verso: Nu");
    if (f.copies > 1) line(`Copii: ${f.copies}`);
    const spiral = config.spiralType;
    if (spiral && spiral !== "none") {
      const color = config.spiralColor ? `, ${config.spiralColor}` : "";
      const label =
        spiral === "plastic"
          ? `Spiralare plastică${color}`
          : spiral === "perforare2"
          ? "Perforare cu 2 găuri"
          : spiral === "capsare"
          ? "Capsare (maxim 240 coli)"
          : spiral;
      line(`Legare: ${label}`);
    } else {
      line("Legare: Doar print");
    }
    if (config.coverFrontColor && config.coverFrontColor !== "transparent") {
      line(`Copertă față: ${config.coverFrontColor}`);
    }
    if (config.coverBackColor && config.coverBackColor !== "transparent") {
      line(`Copertă spate: ${config.coverBackColor}`);
    }
  } else {
    line("Fișiere (ordine printare):");
    files.forEach((f) => {
      const color = f.printMode === "color" ? "Color" : "A-N";
      const fv = f.duplex ? "F-V" : "1 față";
      const copies = f.copies > 1 ? `, ${f.copies} copii` : "";
      sub(`${f.name}: ${color}, ${fv}${copies}`);
    });
    const spiral = config.spiralType;
    if (spiral && spiral !== "none") {
      const color = config.spiralColor ? `, ${config.spiralColor}` : "";
      const label =
        spiral === "plastic"
          ? `Spiralare plastică${color}`
          : spiral === "perforare2"
          ? "Perforare cu 2 găuri"
          : spiral === "capsare"
          ? "Capsare (maxim 240 coli)"
          : spiral;
      line(`Legare: ${label}`);
    } else if (config.spiralType === "none" || !config.spiralType) {
      line("Legare: Doar print");
    }
    if (config.coverFrontColor && config.coverFrontColor !== "transparent") {
      line(`Copertă față: ${config.coverFrontColor}`);
    }
    if (config.coverBackColor && config.coverBackColor !== "transparent") {
      line(`Copertă spate: ${config.coverBackColor}`);
    }
  }
  return parts.length ? parts : [{ text: "—", indent: 0 }];
}

/** Rând fie text, fie linie de fișier; optionText = doar opțiunile de printare (îngroșate), line = numele fișierului (normal). */
type ConfigRow = { kind: "text"; line: string } | { kind: "file"; line: string; optionText?: string; fileIndex: number };

function getConfigRowsWithFileIndices(config: ConfigDetails | null): ConfigRow[] {
  const rows: ConfigRow[] = [];
  if (!config) {
    rows.push({ kind: "text", line: "—" });
    return rows;
  }
  const files = config.files ?? [];
  const groupSizes = config.bindingGroupSizes;
  const bindingOptions = config.bindingOptions ?? [];

  if (files.length === 0) {
    return rows;
  }
  if (groupSizes && groupSizes.length > 0 && bindingOptions.length === groupSizes.length) {
    let fileIndex = 0;
    groupSizes.forEach((size, gi) => {
      if (gi > 0) rows.push({ kind: "text", line: "" });
      const groupFiles = files.slice(fileIndex, fileIndex + size);
      const opts = bindingOptions[gi];
      const spiral = opts?.spiralType;
      const label =
        spiral && spiral !== "none"
          ? spiral === "plastic"
            ? `Spiralare plastică${opts?.spiralColor ? `, culoare ${opts.spiralColor}` : ""}`
            : spiral === "perforare2"
            ? "Perforare cu 2 găuri"
            : spiral === "capsare"
            ? "Capsare (maxim 240 coli)"
            : spiral
          : "Doar print";
      rows.push({ kind: "text", line: `Grup ${gi + 1} (ordinea fișierelor în îndosariere): — Legare: ${label}` });
      if (opts?.coverFrontColor && opts.coverFrontColor !== "transparent") {
        rows.push({ kind: "text", line: `  Copertă față: ${opts.coverFrontColor}` });
      }
      if (opts?.coverBackColor && opts.coverBackColor !== "transparent") {
        rows.push({ kind: "text", line: `  Copertă spate: ${opts.coverBackColor}` });
      }
      groupFiles.forEach((f, pos) => {
        const color = f.printMode === "color" ? "Color" : "Alb-negru";
        const fv = f.duplex ? "Față-verso" : "O față";
        const copies = f.copies > 1 ? `, ${f.copies} copii` : "";
        rows.push({ kind: "file", line: `  ${pos + 1}. ${f.name}:`, optionText: `${color}, ${fv}${copies}`, fileIndex: fileIndex + pos });
      });
      fileIndex += size;
    });
  } else if (files.length === 1) {
    const f = files[0];
    rows.push({ kind: "text", line: f.printMode === "color" ? "Color: Da" : "Alb-negru: Da" });
    rows.push({ kind: "text", line: f.duplex ? "Față-verso: Da" : "Față-verso: Nu" });
    if (f.copies > 1) rows.push({ kind: "text", line: `Copii: ${f.copies}` });
    const spiral = config.spiralType;
    if (spiral && spiral !== "none") {
      const label =
        spiral === "plastic"
          ? "Spiralare plastică"
          : spiral === "perforare2"
          ? "Perforare cu 2 găuri"
          : spiral === "capsare"
          ? "Capsare (maxim 240 coli)"
          : spiral;
      rows.push({ kind: "text", line: `Legare: ${label}${config.spiralColor ? `, culoare ${config.spiralColor}` : ""}` });
    } else {
      rows.push({ kind: "text", line: "Legare: Doar print" });
    }
    if (config.coverFrontColor && config.coverFrontColor !== "transparent") {
      rows.push({ kind: "text", line: `Copertă față: ${config.coverFrontColor}` });
    }
    if (config.coverBackColor && config.coverBackColor !== "transparent") {
      rows.push({ kind: "text", line: `Copertă spate: ${config.coverBackColor}` });
    }
    rows.push({ kind: "file", line: f.name, fileIndex: 0 });
  } else {
    files.forEach((f, i) => {
      const color = f.printMode === "color" ? "Color" : "Alb-negru";
      const fv = f.duplex ? "Față-verso" : "O față";
      const copies = f.copies > 1 ? `, ${f.copies} copii` : "";
      rows.push({ kind: "file", line: `${f.name}:`, optionText: `${color}, ${fv}${copies}`, fileIndex: i });
    });
    const spiral = config.spiralType;
    if (spiral && spiral !== "none") {
      const label =
        spiral === "plastic"
          ? "Spiralare plastică"
          : spiral === "perforare2"
          ? "Perforare cu 2 găuri"
          : spiral === "capsare"
          ? "Capsare (maxim 240 coli)"
          : spiral;
      rows.push({ kind: "text", line: `Legare: ${label}${config.spiralColor ? `, culoare ${config.spiralColor}` : ""}` });
    } else if (!config.spiralType || config.spiralType === "none") {
      rows.push({ kind: "text", line: "Legare: Doar print" });
    }
    if (config.coverFrontColor && config.coverFrontColor !== "transparent") {
      rows.push({ kind: "text", line: `Copertă față: ${config.coverFrontColor}` });
    }
    if (config.coverBackColor && config.coverBackColor !== "transparent") {
      rows.push({ kind: "text", line: `Copertă spate: ${config.coverBackColor}` });
    }
  }
  return rows;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);
  const styles: Record<string, string> = {
    Nou: "bg-red-100 text-red-800 border-red-200",
    "În lucru": "bg-amber-100 text-amber-800 border-amber-200",
    Gata: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  const style = styles[normalized] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {normalized}
    </span>
  );
}

function getAdminHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function AdminComenziPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [filter, setFilter] = useState<"all" | StatusOption>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    try {
      const res = await fetch("/api/admin/orders", { headers: getAdminHeaders() });
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(true);
        setOrders([]);
        return;
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error ?? "Nu am putut încărca comenzile. Încearcă din nou.");
      setOrders(data.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu am putut încărca comenzile. Verifică conexiunea și încearcă din nou.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchOrders();
  }, [fetchOrders, router]);

  const statusCounts = useMemo(() => {
    const counts = { all: orders.length, Nou: 0, "În lucru": 0, Gata: 0 };
    orders.forEach((o) => {
      const n = normalizeStatus(o.status);
      if (n === "Nou") counts.Nou++;
      else if (n === "În lucru") counts["În lucru"]++;
      else if (n === "Gata") counts.Gata++;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    let list = orders.filter((o) => {
      const norm = normalizeStatus(o.status);
      if (filter !== "all" && norm !== filter) return false;
      if (!searchLower) return true;
      const email = (o.customer_email ?? "").toLowerCase();
      const phone = (o.phone ?? "").replace(/\s/g, "");
      const searchNoSpaces = searchLower.replace(/\s/g, "");
      return email.includes(searchLower) || phone.includes(searchNoSpaces);
    });
    const mult = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortBy === "date") {
        return mult * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      if (sortBy === "price") {
        return mult * (Number(a.total_price) - Number(b.total_price));
      }
      if (sortBy === "payment") {
        const pa = (a.payment_method ?? "").toLowerCase();
        const pb = (b.payment_method ?? "").toLowerCase();
        return mult * pa.localeCompare(pb);
      }
      return 0;
    });
    return list;
  }, [orders, filter, search, sortBy, sortDir]);

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column === "date" ? "desc" : "asc");
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setStatusDropdownId(null);
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Nu am putut schimba statusul. Încearcă din nou.");
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu am putut schimba statusul comenzii.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePrintedToggle = useCallback(
    async (orderId: string, fileIndex: number, fileCount: number) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const current = order.config_details?.printed_files ?? [];
      const arr = Array.from({ length: Math.max(fileCount, current.length) }, (_, i) => current[i] ?? false);
      arr[fileIndex] = !arr[fileIndex];
      const hasAnyPrinted = arr.some(Boolean);
      const body: { printed_files: boolean[]; status?: string } = { printed_files: arr };
      body.status = hasAnyPrinted ? "În lucru" : "Nou";
      setUpdatingId(orderId);
      try {
         const res = await fetch(`/api/admin/orders/${orderId}`, {
          method: "PATCH",
          headers: getAdminHeaders(),
          body: JSON.stringify(body),
        });
        if (res.status === 401 || res.status === 403) {
          setAccessDenied(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Nu am putut actualiza. Încearcă din nou.");
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? { ...o, config_details: { ...o.config_details, printed_files: arr }, status: hasAnyPrinted ? "În lucru" : "Nou" }
              : o
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Eroare la bifare printat.");
      } finally {
        setUpdatingId(null);
      }
    },
    [orders]
  );

  const handleRambursConfirmedToggle = useCallback(
    async (orderId: string) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order || order.payment_method !== "ramburs") return;
      const newValue = !(order.config_details?.ramburs_confirmed === true);
      setUpdatingId(orderId);
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`, {
          method: "PATCH",
          headers: getAdminHeaders(),
          body: JSON.stringify({ ramburs_confirmed: newValue }),
        });
        if (res.status === 401 || res.status === 403) {
          setAccessDenied(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Eroare la actualizare.");
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? { ...o, config_details: { ...o.config_details, ramburs_confirmed: newValue } }
              : o
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Eroare la confirmare ramburs.");
      } finally {
        setUpdatingId(null);
      }
    },
    [orders]
  );

  const handleDownloadPdf = useCallback((url: string) => {
    setDownloadingUrl(url);
    const downloadApiUrl = `/api/admin/download?url=${encodeURIComponent(url)}`;
    window.open(downloadApiUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => setDownloadingUrl(null), 800);
  }, []);

  const [previewDeletedId, setPreviewDeletedId] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);

  const handleCleanup = useCallback(async () => {
    if (!confirm("Sigur vrei să ștergi fișierele comenzilor mai vechi de 30 de zile?\n\nNumele fișierelor și detaliile comenzii rămân vizibile.")) return;
    setCleaningUp(true);
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST", headers: getAdminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eroare la curățare.");
      alert(data.message);
      fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la curățare.");
    } finally {
      setCleaningUp(false);
    }
  }, [fetchOrders]);

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const awbInputRef = useRef<Record<string, HTMLInputElement | null>>({});
  const facturaInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  const handleDocUpload = useCallback(async (orderId: string, docType: "awb" | "factura", file: File) => {
    const key = `${docType}-${orderId}`;
    setUploadingDoc(key);
    try {
      const token = sessionStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("orderId", orderId);
      formData.append("docType", docType);
      formData.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eroare la încărcare.");

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, [docType === "awb" ? "awb_url" : "factura_url"]: data.url }
            : o
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcarea documentului.");
    } finally {
      setUploadingDoc(null);
    }
  }, []);

  const copyToClipboard = useCallback((text: string, orderId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(orderId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  useEffect(() => {
    if (accessDenied) {
      router.replace("/login");
    }
  }, [accessDenied, router]);

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header dashboard */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-white">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">Admin Comenzi</h1>
              <p className="text-sm text-slate-500">Gestionează comenzile clienților</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCleanup}
              disabled={cleaningUp}
              className="flex items-center gap-2 rounded-xl border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
              title="Șterge fișierele comenzilor mai vechi de 30 de zile"
            >
              {cleaningUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Curățare fișiere vechi
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Ieșire
            </button>
          </div>
        </div>

        {/* Cifre rapide + filtre */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                filter === tab.id
                  ? "border-slate-800 bg-slate-800 text-white shadow-md"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="block text-2xl font-bold tabular-nums">
                {tab.id === "all" ? statusCounts.all : statusCounts[tab.id]}
              </span>
              <span className="text-xs font-medium opacity-90">{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="mb-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută după email sau telefon..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl bg-white py-24 shadow-sm ring-1 ring-slate-200">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">
            {orders.length === 0
              ? "Nu există comenzi."
              : "Nicio comandă în această categorie."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="w-10 px-2 py-3 font-semibold text-slate-700"></th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSort("date")}
                        className="inline-flex items-center gap-1 rounded hover:bg-slate-100 px-1 -mx-1"
                      >
                        Data
                        {sortBy === "date" && (sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Email / Telefon</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSort("price")}
                        className="inline-flex items-center gap-1 rounded hover:bg-slate-100 px-1 -mx-1"
                      >
                        Preț
                        {sortBy === "price" && (sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSort("payment")}
                        className="inline-flex items-center gap-1 rounded hover:bg-slate-100 px-1 -mx-1"
                      >
                        Plată
                        {sortBy === "payment" && (sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Fișiere</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const fileUrls = getFileUrls(order.file_url);
                    const fileNames = order.config_details?.files?.map((f) => f.name) ?? [];
                    const normalizedStatus = normalizeStatus(order.status);
                    const isDropdownOpen = statusDropdownId === order.id;
                    const isDetailsOpen = expandedDetailsId === order.id;
                    const isRambursUnconfirmed = order.payment_method === "ramburs" && order.config_details?.ramburs_confirmed !== true;
                    const isPaidOrRambursConfirmed = order.payment_method === "stripe" || (order.payment_method === "ramburs" && order.config_details?.ramburs_confirmed === true);
                    const logs = order.change_logs ?? [];
                    const rowBg = isPaidOrRambursConfirmed ? "bg-emerald-200 hover:bg-emerald-300" : isRambursUnconfirmed ? "bg-amber-200 hover:bg-amber-300" : "hover:bg-slate-50/50";
                    return (
                      <Fragment key={order.id}>
                        <tr className={`border-b border-slate-100 ${rowBg}`}>
                          <td className="w-10 px-2 py-3 align-top">
                            <button
                              type="button"
                              onClick={() => setExpandedDetailsId(isDetailsOpen ? null : order.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              title={isDetailsOpen ? "Ascunde detalii" : "Detalii comandă"}
                              aria-expanded={isDetailsOpen}
                            >
                              <ChevronRight
                                className={`h-5 w-5 transition-transform ${isDetailsOpen ? "rotate-90" : ""}`}
                              />
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {formatDate(order.created_at)}
                          </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-slate-800">{order.customer_email || "—"}</span>
                            <span className="text-xs text-slate-500">{formatPhoneDisplay(order.phone)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {Number(order.total_price).toFixed(2)} lei
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {order.payment_method === "stripe"
                            ? "Online (card)"
                            : order.payment_method === "ramburs"
                              ? "Ramburs"
                              : order.payment_method}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-sm">
                          {fileUrls.length > 0
                            ? `${fileUrls.length} ${fileUrls.length === 1 ? "fișier" : "fișiere"} · Deschide detalii pentru descărcare`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            {updatingId === order.id ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                <StatusBadge status={order.status} />
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStatusDropdownId(isDropdownOpen ? null : order.id)
                                  }
                                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:bg-slate-50"
                                >
                                  <StatusBadge status={order.status} />
                                  <ChevronDown
                                    className={`h-4 w-4 text-slate-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                                  />
                                </button>
                                {isDropdownOpen && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-10"
                                      aria-hidden
                                      onClick={() => setStatusDropdownId(null)}
                                    />
                                    <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                      {STATUS_OPTIONS.map((status) => (
                                        <button
                                          key={status}
                                          type="button"
                                          onClick={() => handleStatusChange(order.id, status)}
                                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                                            normalizedStatus === status
                                              ? "bg-slate-100 font-medium text-slate-800"
                                              : "text-slate-600"
                                          }`}
                                        >
                                          {status}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isDetailsOpen && (
                        <tr key={`${order.id}-details`} className={`border-b border-slate-100 ${isRambursUnconfirmed ? "bg-amber-200/90" : isPaidOrRambursConfirmed ? "bg-emerald-200/80" : "bg-slate-50/50"}`}>
                          <td colSpan={7} className="px-4 py-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                              <h4 className="mb-3 text-sm font-semibold text-slate-800">Detalii comandă și livrare</h4>
                              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                <div className="flex items-start gap-2">
                                  <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                  <div>
                                    <span className="text-slate-500">Nume</span>
                                    <p className="font-medium text-slate-800">{(order as { customer_name?: string }).customer_name || "—"}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                  <div>
                                    <span className="text-slate-500">Email</span>
                                    <p className="font-medium text-slate-800">{order.customer_email || "—"}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 flex-wrap items-center lg:col-span-2">
                                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <div>
                                      <span className="text-slate-500">Telefon</span>
                                      <p className="text-base font-bold text-slate-800">{formatPhoneDisplay(order.phone)}</p>
                                    </div>
                                    {order.payment_method === "ramburs" && (
                                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                        <input
                                          type="checkbox"
                                          checked={order.config_details?.ramburs_confirmed === true}
                                          onChange={() => handleRambursConfirmedToggle(order.id)}
                                          disabled={updatingId === order.id}
                                          className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                                        />
                                        <span className="text-sm font-medium text-slate-700">Confirmare comandă (ramburs)</span>
                                        {updatingId === order.id && (
                                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                        )}
                                      </label>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 sm:col-span-2 lg:col-span-3">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-slate-500">Adresă livrare</span>
                                    <p className="font-medium text-slate-800">{(order as { shipping_address?: string }).shipping_address || "—"}</p>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-slate-500">Metodă plată</span>
                                  <p className="font-medium text-slate-800">
                                    {order.payment_method === "stripe" ? "Online (card)" : order.payment_method === "ramburs" ? "Ramburs" : order.payment_method}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Total</span>
                                  <p className="font-medium text-slate-800">{Number(order.total_price).toFixed(2)} lei</p>
                                </div>
                                {(() => {
                                  const isDeleted = !!order.files_deleted_at || previewDeletedId === order.id;
                                  const deletedDate = order.files_deleted_at ? formatDate(order.files_deleted_at) : previewDeletedId === order.id ? "Preview — așa va arăta după ștergere" : null;
                                  return (
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-sm font-semibold text-slate-600">Documente comandă</h4>
                                    {!order.files_deleted_at && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewDeletedId(previewDeletedId === order.id ? null : order.id)}
                                        className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100"
                                        title="Vezi cum va arăta comanda după ștergerea automată a fișierelor"
                                      >
                                        <Eye className="h-3 w-3" />
                                        {previewDeletedId === order.id ? "Ascunde preview" : "Preview ștergere"}
                                      </button>
                                    )}
                                  </div>

                                  {isDeleted ? (
                                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                                      <div className="flex items-start gap-2 mb-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                                        <div>
                                          <p className="text-sm font-medium text-orange-800">
                                            Fișierele acestei comenzi au fost șterse automat
                                          </p>
                                          <p className="text-xs text-orange-600 mt-0.5">
                                            {deletedDate}
                                          </p>
                                          <p className="text-xs text-orange-600 mt-1">
                                            Numele fișierelor și detaliile printării rămân mai jos pentru referință.
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                                        <span className="flex items-center gap-1.5">
                                          <FileText className="h-3.5 w-3.5" />
                                          AWB: <span className="italic">șters</span>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                          <FileText className="h-3.5 w-3.5" />
                                          Factură: <span className="italic">ștearsă</span>
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                  <div className="flex flex-wrap gap-3">
                                    {/* AWB */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-slate-600 font-medium w-16">AWB:</span>
                                      {order.awb_url ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDownloadPdf(order.awb_url!)}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                          Descarcă AWB
                                        </button>
                                      ) : null}
                                      <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        ref={(el) => { awbInputRef.current[order.id] = el; }}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) handleDocUpload(order.id, "awb", f);
                                          e.target.value = "";
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => awbInputRef.current[order.id]?.click()}
                                        disabled={uploadingDoc === `awb-${order.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        {uploadingDoc === `awb-${order.id}` ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Upload className="h-3.5 w-3.5" />
                                        )}
                                        {order.awb_url ? "Înlocuiește" : "Încarcă AWB"}
                                      </button>
                                    </div>
                                    {/* Factura */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-slate-600 font-medium w-16">Factură:</span>
                                      {order.factura_url ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDownloadPdf(order.factura_url!)}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                          Descarcă factura
                                        </button>
                                      ) : null}
                                      <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        ref={(el) => { facturaInputRef.current[order.id] = el; }}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) handleDocUpload(order.id, "factura", f);
                                          e.target.value = "";
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => facturaInputRef.current[order.id]?.click()}
                                        disabled={uploadingDoc === `factura-${order.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        {uploadingDoc === `factura-${order.id}` ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Upload className="h-3.5 w-3.5" />
                                        )}
                                        {order.factura_url ? "Înlocuiește" : "Încarcă factură"}
                                      </button>
                                    </div>
                                  </div>
                                  )}
                                </div>
                                  );
                                })()}
                                {(() => {
                                  const isDeletedPrint = !!order.files_deleted_at || previewDeletedId === order.id;
                                  return (
                                <div className="sm:col-span-2 lg:col-span-3">
                                    <h4 className="text-sm font-semibold text-slate-600 mb-2">
                                      {isDeletedPrint ? 'Configurare printare (fișiere șterse)' : 'Configurare printare, îndosariere și descărcare'}
                                    </h4>
                                    {isDeletedPrint ? (
                                      <p className="text-xs text-orange-600 mb-2 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Fișierele PDF au fost șterse automat — doar numele și setările sunt vizibile.
                                      </p>
                                    ) : (
                                      <p className="text-xs text-slate-500 mb-2">Bifează „Printat” când documentul a fost printat.</p>
                                    )}
                                    <div className="space-y-1.5 text-[15px] leading-relaxed text-slate-800">
                                      {getConfigRowsWithFileIndices(order.config_details).map((row, i) =>
                                        row.kind === "text" ? (
                                          row.line === "" ? (
                                            <div key={`${order.id}-cfg-${i}`} className="h-4" aria-hidden />
                                          ) : (
                                            <p key={`${order.id}-cfg-${i}`} className="font-bold text-slate-800">
                                              {row.line}
                                            </p>
                                          )
                                        ) : (
                                          <div
                                            key={`${order.id}-cfg-${i}`}
                                            className="flex flex-wrap items-center gap-2 py-1 border-b border-slate-100 last:border-0"
                                          >
                                            {!isDeletedPrint && row.fileIndex < fileUrls.length && (
                                              <button
                                                type="button"
                                                onClick={() => handleDownloadPdf(fileUrls[row.fileIndex])}
                                                disabled={downloadingUrl === fileUrls[row.fileIndex]}
                                                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-70"
                                                title={fileNames[row.fileIndex] ?? `PDF ${row.fileIndex + 1}`}
                                              >
                                                {downloadingUrl === fileUrls[row.fileIndex] ? (
                                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                  <Download className="h-3.5 w-3.5" />
                                                )}
                                                <span className="truncate max-w-[140px]">PDF</span>
                                              </button>
                                            )}
                                            {isDeletedPrint && (
                                              <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-400 italic">
                                                <FileText className="h-3.5 w-3.5" />
                                                șters
                                              </span>
                                            )}
                                            {!isDeletedPrint && (
                                              <label className="flex shrink-0 items-center gap-1.5 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={order.config_details?.printed_files?.[row.fileIndex] === true}
                                                  onChange={() => handlePrintedToggle(order.id, row.fileIndex, fileUrls.length)}
                                                  disabled={updatingId === order.id}
                                                  className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                                                />
                                                <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Printat</span>
                                              </label>
                                            )}
                                            {row.kind === "file" && row.optionText != null && (
                                              <span className="shrink-0 text-sm font-bold text-slate-700">{row.optionText}</span>
                                            )}
                                            <span className={`min-w-0 flex-1 truncate ${isDeletedPrint ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                              {row.line}
                                            </span>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                  );
                                })()}
                              </div>
                              {logs.length > 0 && (
                                <div className="mt-4 border-t border-slate-200 pt-4">
                                  <h4 className="mb-2 text-sm font-semibold text-slate-800">Modificări (log)</h4>
                                  <ul className="space-y-2">
                                    {(logs as ChangeLogEntry[]).slice().reverse().map((entry, i) => (
                                      <li key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
                                        <span className="font-medium text-slate-700">{formatDate(entry.created_at)}</span>
                                        <span className="text-slate-500">·</span>
                                        <span className="text-slate-600">{entry.email}</span>
                                        <span className="text-slate-500">·</span>
                                        <span className="text-slate-800">{entry.what}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
