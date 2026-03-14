"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  FileUp,
  FileText,
  Printer,
  CreditCard,
  Loader2,
  X,
  BookOpen,
  BookMarked,
  Circle,
  CheckCircle2,
  Settings2,
  ChevronUp,
  ChevronDown,
  Link2,
  Unlink2,
  Plus,
  ChevronRight,
  HelpCircle,
  Upload,
  Check,
} from "lucide-react";
import { getPdfPageCount, analyzePdfColors, type PdfColorAnalysis } from "@/lib/pdf-utils";

// ─── Constants ───────────────────────────────────────────────────────────────
const PRICE_BW_ONE_SIDE = 0.25;
const PRICE_BW_DUPLEX = 0.35;
const PRICE_COLOR_ONE_SIDE = 1.5;
const PRICE_COLOR_DUPLEX = 2.5;
const SPIRAL_PRICE = 3;
const SHIPPING_COST_LEI = 15;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const FILE_SIZE_ERROR_MSG = "Fișier prea mare (max 50 MB).";
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;
const MIN_ADDRESS_LENGTH = 10;
const MAX_ADDRESS_LENGTH = 300;
const ROMANIAN_PHONE_DIGITS = /^(0?7[0-9]{8}|407[0-9]{8})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_NAME_REGEX = /^[a-zA-ZăâîșțĂÂÎȘȚ\s\-']+$/;

// ─── Types ───────────────────────────────────────────────────────────────────
type ShippingForm = { name: string; phone: string; email: string; address: string };
type ShippingErrors = Partial<Record<keyof ShippingForm, string>>;

function validateShipping(form: ShippingForm): ShippingErrors {
  const err: ShippingErrors = {};
  const name = form.name.trim();
  const phone = form.phone.trim().replace(/\s/g, "");
  const email = form.email.trim().toLowerCase();
  const address = form.address.trim();
  if (!name) err.name = "Numele este obligatoriu.";
  else if (name.length < MIN_NAME_LENGTH) err.name = `Numele trebuie să aibă cel puțin ${MIN_NAME_LENGTH} caractere.`;
  else if (name.length > MAX_NAME_LENGTH) err.name = `Numele nu poate depăși ${MAX_NAME_LENGTH} caractere.`;
  else if (!VALID_NAME_REGEX.test(name)) err.name = "Numele poate conține doar litere, spații, cratimă și apostrof.";
  const digitsOnly = phone.replace(/\D/g, "");
  if (!phone) err.phone = "Numărul de telefon este obligatoriu.";
  else if (!ROMANIAN_PHONE_DIGITS.test(digitsOnly)) err.phone = "Introdu un număr de telefon valid (ex: 0712345678).";
  if (!email) err.email = "Emailul este obligatoriu.";
  else if (!EMAIL_REGEX.test(email)) err.email = "Introdu o adresă de email validă.";
  if (!address) err.address = "Adresa de livrare este obligatorie.";
  else if (address.length < MIN_ADDRESS_LENGTH) err.address = `Adresa trebuie să aibă cel puțin ${MIN_ADDRESS_LENGTH} caractere.`;
  else if (address.length > MAX_ADDRESS_LENGTH) err.address = `Adresa nu poate depăși ${MAX_ADDRESS_LENGTH} caractere.`;
  return err;
}

type PrintMode = "color" | "bw";
type SpiralType = "none" | "spirala" | "perforare2" | "capsare";
type SpiralColorOption = "negru" | "alb";
type CoverBackColor = "negru" | "alb" | "albastru_inchis" | "galben" | "rosu" | "verde";

type OrderSuccessGroup = {
  files: { name: string; pages: number | null; printMode: string; duplex: boolean; copies: number }[];
  spiralType: SpiralType;
  spiralColor: SpiralColorOption;
  coverBackColor: CoverBackColor;
};

type OrderSuccessDetails = {
  paymentMethod: "stripe" | "ramburs";
  groups: OrderSuccessGroup[];
  totalPages: number;
  totalPrice: number;
  totalWithShipping: number;
};

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  pages: number | null;
  error?: string;
  printMode: PrintMode;
  duplex: boolean;
  copies: number;
  previewUrl: string;
  previewOpen?: boolean;
  groupWithPrevious: boolean;
  colorAnalysis?: PdfColorAnalysis;
}

const DEFAULT_PRINT_OPTIONS = {
  printMode: "bw" as PrintMode,
  duplex: false,
  copies: 1,
};

function getBindingGroups(files: UploadedFile[]): { groupIndex: number; filesInGroup: UploadedFile[] }[] {
  if (files.length === 0) return [];
  const result: { groupIndex: number; filesInGroup: UploadedFile[] }[] = [];
  let current: UploadedFile[] = [files[0]];
  for (let i = 1; i < files.length; i++) {
    if (files[i].groupWithPrevious === true) {
      current.push(files[i]);
    } else {
      result.push({ groupIndex: result.length, filesInGroup: current });
      current = [files[i]];
    }
  }
  result.push({ groupIndex: result.length, filesInGroup: current });
  return result;
}

/** Calculează prețul unui singur fișier */
function calculateFilePrice(f: UploadedFile): number {
  if (f.pages == null) return 0;
  const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
  const duplex = f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex;
  const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;

  if (mode === "bw") {
    const sides = f.pages * copies;
    return duplex ? Math.ceil(sides / 2) * PRICE_BW_DUPLEX : sides * PRICE_BW_ONE_SIDE;
  }

  if (f.colorAnalysis) {
    const colorSides = f.colorAnalysis.colorPages * copies;
    const bwSides = f.colorAnalysis.bwPages * copies;
    if (duplex) {
      return Math.ceil(colorSides / 2) * PRICE_COLOR_DUPLEX + Math.ceil(bwSides / 2) * PRICE_BW_DUPLEX;
    }
    return colorSides * PRICE_COLOR_ONE_SIDE + bwSides * PRICE_BW_ONE_SIDE;
  }

  const sides = f.pages * copies;
  return duplex ? Math.ceil(sides / 2) * PRICE_COLOR_DUPLEX : sides * PRICE_COLOR_ONE_SIDE;
}

// ─── Progress Stepper Component ──────────────────────────────────────────────
function ProgressStepper({ currentStep }: { currentStep: number }) {
  const steps = [
    { label: "Încarcă", icon: Upload },
    { label: "Configurează", icon: Settings2 },
    { label: "Plătește", icon: CreditCard },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${
                  isDone
                    ? "bg-green-500 text-white shadow-md shadow-green-500/20"
                    : isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-110"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={`text-xs font-semibold transition-colors ${
                  isDone ? "text-green-600" : isActive ? "text-blue-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-2 sm:mx-4 mb-5">
                <div
                  className={`h-0.5 w-8 sm:w-16 rounded-full transition-colors duration-300 ${
                    i < currentStep ? "bg-green-400" : "bg-slate-200"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── FAQ Component ────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const items = [
    { q: "Ce format de fișier acceptați?", a: "Acceptăm doar fișiere PDF, cu o dimensiune maximă de 50 MB per fișier. Poți încărca până la 20 de fișiere simultan." },
    { q: "Cum funcționează spiralarea?", a: "Spiralarea leagă documentele într-un volum unic cu spirală de plastic. Poți alege culoarea spiralei (negru sau alb) și culoarea copertei spate. Coperta față este întotdeauna transparentă." },
    { q: "Pot lega mai multe fișiere într-o singură spirală?", a: "Da! Folosește butonul „Leagă împreună" dintre două fișiere din listă pentru a le combina într-un singur volum spiralat." },
    { q: "Cum se calculează prețul?", a: "Prețul depinde de tipul printării (alb-negru sau color), față-verso, numărul de copii și opțiunea de spiralare. Paginile color din documente sunt detectate automat pentru un preț corect." },
    { q: "Cât durează livrarea?", a: "Comenzile sunt procesate în 1-2 zile lucrătoare, iar livrarea prin curier durează 1-3 zile lucrătoare. Costul transportului este de 15 lei." },
    { q: "Ce metode de plată acceptați?", a: "Acceptăm plata online cu cardul (prin Stripe, 100% securizat) sau plata la livrare (ramburs)." },
  ];
  return (
    <section className="mt-12 mx-auto max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <HelpCircle className="h-5 w-5 text-blue-600" />
        <h2 className="text-xl font-bold text-slate-800">Întrebări frecvente</h2>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-700">{item.q}</span>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  open === i ? "rotate-90" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                open === i ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Upload Progress Bar ──────────────────────────────────────────────────────
function UploadProgressBar({ isUploading, progress }: { isUploading: boolean; progress: number }) {
  if (!isUploading) return null;
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Se încarcă fișierele...</span>
        </div>
        <span className="text-sm font-bold text-blue-700 tabular-nums">{progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-blue-200/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Toast Component ─────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "bg-green-50 border-green-300 text-green-800",
    error: "bg-red-50 border-red-300 text-red-800",
    info: "bg-blue-50 border-blue-300 text-blue-800",
  };

  return (
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-xl border px-5 py-3 shadow-lg animate-[fade-in_0.3s_ease-out] ${colors[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button type="button" onClick={onClose} className="p-1 hover:opacity-70">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page Component ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingForm>({ name: "", phone: "", email: "", address: "" });
  const [shippingErrors, setShippingErrors] = useState<ShippingErrors>({});
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "ramburs">("stripe");
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderSuccessDetails, setOrderSuccessDetails] = useState<OrderSuccessDetails | null>(null);
  const [scrollToFileId, setScrollToFileId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const defaultGroupOpts = {
    spiralType: "none" as SpiralType,
    spiralColor: "negru" as SpiralColorOption,
    coverBackColor: "negru" as CoverBackColor,
  };
  const [groupOptions, setGroupOptions] = useState<Record<number, typeof defaultGroupOpts>>({});
  const bindingGroups = useMemo(() => getBindingGroups(files), [files]);
  const selectedGroupIndex: number | null = useMemo(() => {
    if (!selectedFileId || files.length === 0) return null;
    const idx = bindingGroups.findIndex((g) => g.filesInGroup.some((f) => f.id === selectedFileId));
    return idx >= 0 ? idx : null;
  }, [selectedFileId, bindingGroups, files.length]);

  const spiralType = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).spiralType : defaultGroupOpts.spiralType;
  const spiralColor = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).spiralColor : defaultGroupOpts.spiralColor;
  const coverBackColor = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).coverBackColor : defaultGroupOpts.coverBackColor;

  const updateSelectedGroupOptions = useCallback((patch: Partial<typeof defaultGroupOpts>) => {
    if (selectedGroupIndex === null) return;
    setGroupOptions((prev) => ({
      ...prev,
      [selectedGroupIndex]: { ...defaultGroupOpts, ...prev[selectedGroupIndex], ...patch },
    }));
  }, [selectedGroupIndex]);

  const currentStep = useMemo(() => {
    if (files.length === 0) return 0;
    if (checkoutModalOpen) return 2;
    return 1;
  }, [files.length, checkoutModalOpen]);

  const loadPageCounts = useCallback(async (newFiles: UploadedFile[]) => {
    setIsLoadingPages(true);
    const updated = await Promise.all(
      newFiles.map(async (item) => {
        if (item.pages != null) return item;
        try {
          const colorAnalysis = await analyzePdfColors(item.file);
          return { ...item, pages: colorAnalysis.totalPages, colorAnalysis };
        } catch {
          try {
            const pages = await getPdfPageCount(item.file);
            return { ...item, pages };
          } catch {
            return { ...item, pages: null, error: "Nu s-a putut citi PDF-ul" };
          }
        }
      })
    );
    setFiles((prev) =>
      prev.map((f) => {
        const loaded = updated.find((u) => u.id === f.id);
        if (!loaded) return f;
        return { ...f, pages: loaded.pages ?? f.pages, error: loaded.error ?? f.error, colorAnalysis: loaded.colorAnalysis ?? f.colorAnalysis };
      })
    );
    setIsLoadingPages(false);
  }, []);

  const createFileItems = useCallback((fileList: File[]): UploadedFile[] => {
    return fileList.map((file) => {
      const tooBig = file.size > MAX_FILE_SIZE_BYTES;
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        pages: null,
        error: tooBig ? FILE_SIZE_ERROR_MSG : undefined,
        printMode: "bw" as PrintMode,
        duplex: false,
        copies: 1,
        previewUrl: URL.createObjectURL(file),
        groupWithPrevious: false,
      };
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
      if (dropped.length === 0) return;
      const newItems = createFileItems(dropped);
      setFiles((prev) => {
        const next = [...prev, ...newItems];
        if (prev.length === 0 && newItems.length > 0) setSelectedFileId(newItems[0].id);
        return next;
      });
      addToast(`${dropped.length} fișier${dropped.length > 1 ? "e" : ""} adăugat${dropped.length > 1 ? "e" : ""}`, "success");
      loadPageCounts([...files, ...newItems]);
    },
    [files, loadPageCounts, createFileItems, addToast]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected?.length) return;
      const newItems = createFileItems(Array.from(selected));
      setFiles((prev) => {
        const next = [...prev, ...newItems];
        if (prev.length === 0 && newItems.length > 0) setSelectedFileId(newItems[0].id);
        return next;
      });
      addToast(`${selected.length} fișier${selected.length > 1 ? "e" : ""} adăugat${selected.length > 1 ? "e" : ""}`, "success");
      loadPageCounts([...files, ...newItems]);
      e.target.value = "";
    },
    [files, loadPageCounts, createFileItems, addToast]
  );

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const toRemove = prev.find((f) => f.id === id);
      if (toRemove?.previewUrl) URL.revokeObjectURL(toRemove.previewUrl);
      const next = prev.filter((f) => f.id !== id);
      if (selectedFileId === id) setSelectedFileId(next.length > 0 ? next[0].id : null);
      return next;
    });
    if (previewFileId === id) setPreviewFileId(null);
  };

  const moveFileUp = (id: string) => {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      if (i <= 0) return prev;
      const wasFirstInGroup = prev[i].groupWithPrevious === false;
      const next = [...prev];
      [next[i - 1], next[i]] = [{ ...prev[i] }, { ...prev[i - 1] }];
      const upGroupWithPrevious = i - 1 === 0 ? false : next[i - 2].groupWithPrevious === true;
      const downGroupWithPrevious = wasFirstInGroup ? false : upGroupWithPrevious;
      next[i - 1] = { ...next[i - 1], groupWithPrevious: upGroupWithPrevious };
      next[i] = { ...next[i], groupWithPrevious: downGroupWithPrevious };
      return next;
    });
    setScrollToFileId(id);
  };

  const moveFileDown = (id: string) => {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      if (i < 0 || i >= prev.length - 1) return prev;
      const wasLastInGroup = prev[i].groupWithPrevious === true && (i === prev.length - 1 || prev[i + 1].groupWithPrevious === false);
      const next = [...prev];
      [next[i], next[i + 1]] = [{ ...prev[i + 1] }, { ...prev[i] }];
      const upGroupWithPrevious = i === 0 ? false : next[i - 1].groupWithPrevious === true;
      const downGroupWithPrevious = wasLastInGroup ? false : upGroupWithPrevious;
      next[i] = { ...next[i], groupWithPrevious: upGroupWithPrevious };
      next[i + 1] = { ...next[i + 1], groupWithPrevious: downGroupWithPrevious };
      return next;
    });
    setScrollToFileId(id);
  };

  useEffect(() => {
    if (!scrollToFileId) return;
    const timer = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-file-id="${scrollToFileId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setScrollToFileId(null);
    });
    return () => cancelAnimationFrame(timer);
  }, [scrollToFileId]);

  // ─── Price calculations ────────────────────────────────────────────────────
  const totalPages = files.reduce(
    (sum, f) => sum + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
    0
  );

  const detectedColorPages = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
    if (mode === "color" && f.colorAnalysis) return sum + f.colorAnalysis.colorPages * copies;
    return sum;
  }, 0);

  const detectedBwPages = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
    if (mode === "color" && f.colorAnalysis) return sum + f.colorAnalysis.bwPages * copies;
    if (mode === "bw") return sum + f.pages * copies;
    return sum;
  }, 0);

  const userChosenColorPages = files.reduce(
    (sum, f) =>
      sum + (f.pages != null && (f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode) === "color" ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
    0
  );

  const pagePrice = files.reduce((sum, f) => sum + calculateFilePrice(f), 0);

  const spiralPrice = useMemo(() => {
    let sum = 0;
    bindingGroups.forEach((grp, groupIndex) => {
      const groupPages = grp.filesInGroup.reduce(
        (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
        0
      );
      const opts = groupOptions[groupIndex] ?? defaultGroupOpts;
      if (groupPages > 0 && opts.spiralType === "spirala") sum += SPIRAL_PRICE;
    });
    return sum;
  }, [bindingGroups, groupOptions]);

  const totalPrice = pagePrice + spiralPrice;
  const totalWithShipping = totalPrice + SHIPPING_COST_LEI;

  // ─── Options data ──────────────────────────────────────────────────────────
  const coverBackColors: { value: CoverBackColor; label: string; circleClass: string }[] = [
    { value: "negru", label: "Negru", circleClass: "bg-slate-800" },
    { value: "alb", label: "Alb", circleClass: "bg-white border border-slate-200 shadow-inner" },
    { value: "albastru_inchis", label: "Albastru închis", circleClass: "bg-blue-900" },
    { value: "galben", label: "Galben", circleClass: "bg-yellow-400" },
    { value: "rosu", label: "Roșu", circleClass: "bg-red-500" },
    { value: "verde", label: "Verde", circleClass: "bg-green-600" },
  ];

  const spiralColorOptions: { value: SpiralColorOption; label: string; circleClass: string }[] = [
    { value: "negru", label: "Negru", circleClass: "bg-slate-800" },
    { value: "alb", label: "Alb", circleClass: "bg-white border border-slate-200 shadow-inner" },
  ];

  const selectedGroupPages =
    selectedGroupIndex !== null
      ? bindingGroups[selectedGroupIndex].filesInGroup.reduce(
          (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
          0
        )
      : totalPages;

  const spiralOptions: { value: SpiralType; label: string; icon: React.ReactNode; description: string }[] = [
    { value: "none", label: "Doar print", icon: <BookOpen className="h-6 w-6" />, description: "Fără legare" },
    { value: "spirala", label: "Spiralare", icon: <Circle className="h-6 w-6" />, description: "3 lei" },
    { value: "perforare2", label: "Perforare", icon: <BookMarked className="h-6 w-6" />, description: "2 găuri" },
    { value: "capsare", label: "Capsare", icon: <CheckCircle2 className="h-6 w-6" />, description: "Max 240 coli" },
  ];

  // ─── Checkout handler ──────────────────────────────────────────────────────
  const handleOpenCheckout = () => {
    setCheckoutError(null);
    setOrderSuccess(null);
    setCheckoutModalOpen(true);
  };

  const handleSubmitCheckout = async () => {
    const errors = validateShipping(shipping);
    if (Object.keys(errors).length > 0) {
      setShippingErrors(errors);
      setCheckoutError("Completează corect toate câmpurile obligatorii pentru livrare.");
      return;
    }
    setShippingErrors({});
    setCheckoutError(null);
    setIsCheckoutLoading(true);
    const { name, phone, email, address } = shipping;

    const capsareError = bindingGroups.some((grp, groupIndex) => {
      const opts = groupOptions[groupIndex] ?? defaultGroupOpts;
      if (opts.spiralType !== "capsare") return false;
      const groupPages = grp.filesInGroup.reduce(
        (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
        0
      );
      return groupPages > 240;
    });
    if (capsareError) {
      setCheckoutError("Capsarea nu este disponibilă pentru grupuri cu mai mult de 240 de coli.");
      setIsCheckoutLoading(false);
      return;
    }

    try {
      const validFiles = files.filter((f) => !f.error);
      if (validFiles.length === 0) {
        setCheckoutError("Adaugă fișiere PDF valide (max 50 MB per fișier).");
        setIsCheckoutLoading(false);
        return;
      }
      const fileList = validFiles.map((f) => f.file);
      let fileUrls: string[] = [];
      if (fileList.length > 0) {
        setIsUploading(true);
        setUploadProgress(0);
        // Simulate progress
        const progressInterval = setInterval(() => {
          setUploadProgress((p) => Math.min(p + Math.random() * 15, 90));
        }, 500);
        try {
          const formData = new FormData();
          fileList.forEach((file) => formData.append("files", file));
          const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) throw new Error(uploadData.error ?? "Eroare la încărcare");
          fileUrls = uploadData.urls ?? [];
          setUploadProgress(100);
        } finally {
          clearInterval(progressInterval);
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
          }, 500);
        }
      }

      const validBindingGroups = getBindingGroups(validFiles);
      const validBindingOptions = validBindingGroups.map((validGrp) => {
        const fileId = validGrp.filesInGroup[0].id;
        const origIdx = bindingGroups.findIndex((g) => g.filesInGroup.some((f) => f.id === fileId));
        const opts = origIdx >= 0 ? (groupOptions[origIdx] ?? defaultGroupOpts) : defaultGroupOpts;
        return {
          spiralType: opts.spiralType,
          ...(opts.spiralType !== "none" && { spiralColor: opts.spiralColor }),
          coverBackColor: opts.coverBackColor,
        };
      });
      const config_details = {
        files: validFiles.map((f) => ({
          name: f.name,
          pages: f.pages,
          printMode: f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode,
          duplex: f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex,
          copies: f.copies,
        })),
        bindingGroupSizes: validBindingGroups.map((g) => g.filesInGroup.length),
        bindingOptions: validBindingOptions,
        spiralType: validBindingOptions[0]?.spiralType ?? "none",
        ...(validBindingOptions[0]?.spiralType !== "none" && { spiralColor: validBindingOptions[0].spiralColor }),
        coverFrontColor: "transparent",
        coverBackColor: validBindingOptions[0]?.coverBackColor ?? "negru",
      };

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: JSON.stringify(fileUrls),
          total_price: totalWithShipping,
          payment_method: paymentMethod,
          status: "pending",
          customer_email: email.trim().toLowerCase(),
          phone: phone.trim().replace(/\s/g, ""),
          config_details,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error ?? "Eroare la salvare comanda.");

      if (paymentMethod === "ramburs") {
        setOrderSuccessDetails({
          paymentMethod: "ramburs",
          groups: validBindingGroups.map((grp, groupIndex) => {
            const opts = validBindingOptions[groupIndex] ?? defaultGroupOpts;
            return {
              files: grp.filesInGroup.map((f) => ({
                name: f.name,
                pages: f.pages,
                printMode: f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode,
                duplex: f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex,
                copies: f.copies ?? DEFAULT_PRINT_OPTIONS.copies,
              })),
              spiralType: opts.spiralType,
              spiralColor: opts.spiralColor ?? "negru",
              coverBackColor: opts.coverBackColor ?? "negru",
            };
          }),
          totalPages,
          totalPrice,
          totalWithShipping,
        });
        setCheckoutModalOpen(false);
        setFiles([]);
        setSelectedFileId(null);
        addToast("Comanda a fost plasată cu succes!", "success");
        return;
      }

      const fileUrlMeta: Record<string, string> = {};
      fileUrls.forEach((url, i) => { fileUrlMeta[`file_url_${i}`] = url; });
      const coverColorSummary = `fata:transparent;spate:${coverBackColor}`;
      const amountBani = Math.round(totalWithShipping * 100);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountBani,
          currency: "ron",
          metadata: {
            total_pages: String(totalPages),
            print_mode: files[0]?.printMode ?? "bw",
            duplex: String(files[0]?.duplex ?? false),
            spiral_type: spiralType,
            spiral_color: spiralType !== "none" ? spiralColor : "",
            cover_color: coverColorSummary,
            file_names: validFiles.length ? JSON.stringify(validFiles.map((f) => f.name)) : "[]",
            total_lei: String(totalWithShipping),
            shipping_name: name.trim(),
            shipping_phone: phone.trim().replace(/\s/g, ""),
            shipping_email: email.trim().toLowerCase(),
            shipping_address: address.trim(),
            ...fileUrlMeta,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eroare la plată");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Nu s-a primit link de plată");
      }
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Eroare la plată");
      addToast(e instanceof Error ? e.message : "Eroare la plată", "error");
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Render ────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      {/* Toasts */}
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
      ))}

      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
              <Printer className="h-4 w-4" />
              Rapid · Sigur · Stripe
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Printare online
            </h1>
            <p className="mt-2 text-base text-slate-600 sm:text-lg">
              Încarcă PDF-urile, configurează opțiunile și plătește în siguranță.
            </p>
          </div>
          <section className="shrink-0 w-full max-w-full rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:max-h-[11rem] lg:w-auto lg:self-start">
            <div className="flex flex-col lg:max-h-[11rem]">
              <div className="shrink-0 bg-slate-50/80 px-3 py-2 border-b border-slate-200/80">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600 sm:text-sm">Prețuri</p>
              </div>
              <div className="shrink-0">
                <div className="grid grid-cols-3 gap-1.5 p-2 text-xs sm:gap-2 sm:p-2.5 sm:text-sm">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">A/N 1 față</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_BW_ONE_SIDE} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">A/N față-verso</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_BW_DUPLEX} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Color 1 față</p>
                    <p className="mt-0.5 font-semibold text-blue-600 tabular-nums">{PRICE_COLOR_ONE_SIDE} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Color față-verso</p>
                    <p className="mt-0.5 font-semibold text-blue-600 tabular-nums">{PRICE_COLOR_DUPLEX} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Spiralare</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{SPIRAL_PRICE} lei</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </header>

        {/* Progress Stepper */}
        <div className="mt-6">
          <ProgressStepper currentStep={currentStep} />
        </div>

        {/* ═══ Step 0: Empty state — full drop zone ═══ */}
        {files.length === 0 ? (
          <div className="mx-auto w-full max-w-2xl">
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`drop-zone flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
                isDragging
                  ? "border-blue-500 bg-blue-50/90 shadow-inner scale-[1.01]"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-[var(--shadow)]"
              }`}
            >
              <input type="file" accept="application/pdf" multiple onChange={onFileInput} className="hidden" />
              <FileUp className={`drop-zone-icon mb-3 h-14 w-14 ${isDragging ? "text-blue-500" : "text-slate-400"}`} />
              <p className="text-center text-slate-600 text-sm sm:text-base">
                Trage fișiere PDF aici sau{" "}
                <span className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2">
                  click pentru a selecta
                </span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 sm:text-sm">
                Acceptă mai multe fișiere · Doar PDF · Max 50 MB per fișier
              </p>
            </label>

            <FAQ />
          </div>
        ) : (
          <>
            {/* ═══ Step 1: Files loaded — configure ═══ */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-8">
              {/* ─── Left: File list ─── */}
              <div className="flex min-h-0 flex-col">
                {/* Compact add-more drop zone */}
                <label
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`mb-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-all duration-200 ${
                    isDragging
                      ? "border-blue-500 bg-blue-50/90"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept="application/pdf" multiple onChange={onFileInput} className="hidden" />
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isDragging ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Adaugă fișiere PDF</p>
                    <p className="text-xs text-slate-500">Trage aici sau click</p>
                  </div>
                </label>

                <h2 className="mb-3 flex shrink-0 items-center gap-2 text-base font-semibold text-slate-800">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Fișiere încărcate
                  <span className="ml-2 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {files.length}
                  </span>
                </h2>

                {files.length >= 2 && (
                  <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold">Vrei să legi mai multe fișiere într-o singură spirală?</p>
                      <p className="mt-0.5 text-blue-700">
                        Apasă butonul <span className="inline-flex items-center gap-0.5 font-semibold"><Link2 className="inline h-3 w-3" /> Leagă împreună</span> dintre două fișiere.
                      </p>
                    </div>
                  </div>
                )}

                <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-xl border-2 border-slate-200 bg-slate-50/50 pr-1 shadow-inner" style={{ maxHeight: "min(65vh, 520px)" }}>
                  <ul className="space-y-0 py-1 px-1">
                    {files.map((item, globalIndex) => {
                      const groupInfo = bindingGroups.find((g) => g.filesInGroup.some((f) => f.id === item.id));
                      const isInGroup = groupInfo ? groupInfo.filesInGroup.length > 1 : false;
                      const isFirstInGroup = isInGroup && groupInfo!.filesInGroup[0].id === item.id;
                      const isLastInGroup = isInGroup && groupInfo!.filesInGroup[groupInfo!.filesInGroup.length - 1].id === item.id;
                      const nextItem = globalIndex < files.length - 1 ? files[globalIndex + 1] : null;
                      const isLinkedToNext = nextItem?.groupWithPrevious === true;
                      const filePrice = calculateFilePrice(item);

                      return (
                        <li key={item.id} className="list-none">
                          {isFirstInGroup && (
                            <div className="mt-2 flex items-center gap-2 rounded-t-xl border-2 border-b-0 border-blue-300 bg-gradient-to-r from-blue-100 to-blue-50 px-4 py-2.5">
                              <BookMarked className="h-4 w-4 text-blue-600 shrink-0" />
                              <span className="text-sm font-bold text-blue-800">
                                Volum spiralat · {groupInfo!.filesInGroup.length} fișiere legate
                              </span>
                            </div>
                          )}

                          <div
                            data-file-id={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedFileId(item.id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedFileId(item.id); } }}
                            className={`file-list-item flex items-center gap-3 px-4 py-3 transition-all duration-200 ${
                              selectedFileId === item.id
                                ? "ring-2 ring-blue-500 ring-offset-1 bg-white shadow-[var(--shadow)]"
                                : "bg-white shadow-[var(--shadow)] ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow-[var(--shadow-md)]"
                            } ${
                              isInGroup
                                ? `border-x-2 border-blue-300 ${!isFirstInGroup ? "border-t border-t-blue-200/60" : "border-t-0"} ${isLastInGroup ? "border-b-2 rounded-b-xl" : "border-b-0"} ring-0 shadow-none`
                                : "rounded-xl"
                            }`}
                            style={{ animationDelay: `${globalIndex * 60}ms` }}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                              <FileText className="h-5 w-5 text-slate-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-800">{item.name}</p>
                              <p className="text-sm text-slate-500">
                                {item.pages != null ? (
                                  <span>
                                    {item.pages} pag. · {item.copies ?? 1} {(item.copies ?? 1) > 1 ? "copii" : "copie"} ·{" "}
                                    {(item.printMode ?? "bw") === "color" ? "Color" : "A/N"}
                                    {item.duplex ? " · Duplex" : ""}
                                  </span>
                                ) : item.error ? (
                                  <span className="text-red-600">{item.error}</span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Se procesează…
                                  </span>
                                )}
                              </p>
                              {/* Price per file */}
                              {item.pages != null && (
                                <p className="mt-0.5 text-xs font-semibold text-blue-600 tabular-nums">
                                  {filePrice.toFixed(2)} lei
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); moveFileUp(item.id); }}
                                  disabled={globalIndex === 0}
                                  className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
                                  aria-label="Mută sus"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); moveFileDown(item.id); }}
                                  disabled={globalIndex === files.length - 1}
                                  className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
                                  aria-label="Mută jos"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {item.previewUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setPreviewFileId(item.id); }}
                                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                >
                                  Preview
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeFile(item.id); }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Șterge"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {nextItem && (
                            <div className="relative flex items-center justify-center py-1.5">
                              <div className={`absolute inset-x-8 top-1/2 h-px ${isLinkedToNext ? "bg-blue-300" : "bg-slate-200"}`} />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFiles((prev) => prev.map((f, i) => i === globalIndex + 1 ? { ...f, groupWithPrevious: !nextItem.groupWithPrevious } : f));
                                }}
                                className={`relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                                  isLinkedToNext
                                    ? "bg-blue-600 text-white shadow-md hover:bg-blue-700 ring-2 ring-blue-200"
                                    : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:ring-blue-300 hover:text-blue-700 hover:bg-blue-50"
                                }`}
                                title={isLinkedToNext ? "Separă" : "Leagă împreună"}
                              >
                                {isLinkedToNext ? <><Unlink2 className="h-3.5 w-3.5" />Separă</> : <><Link2 className="h-3.5 w-3.5" />Leagă</>}
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {isLoadingPages && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Se procesează fișierele…
                  </p>
                )}
              </div>

              {/* ─── Right: Config panel ─── */}
              <div className="lg:sticky lg:top-6 lg:self-start space-y-5">
                <section className="rounded-2xl border-2 border-blue-200/90 bg-gradient-to-b from-blue-50/60 to-white shadow-lg ring-1 ring-slate-200/80">
                  <div className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                        <Settings2 className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-slate-800 sm:text-lg">Configurare comandă</h2>
                        <p className="text-xs text-slate-600">Opțiuni printare, spirală și coperți</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6">
                    {/* Print options for selected file */}
                    {selectedFileId && files.some((f) => f.id === selectedFileId) ? (
                      (() => {
                        const file = files.find((f) => f.id === selectedFileId)!;
                        const opts = {
                          printMode: file.printMode ?? DEFAULT_PRINT_OPTIONS.printMode,
                          duplex: file.duplex ?? DEFAULT_PRINT_OPTIONS.duplex,
                          copies: file.copies ?? DEFAULT_PRINT_OPTIONS.copies,
                        };
                        return (
                          <div key={file.id}>
                            <div className="mb-4 flex items-center gap-2">
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                <Printer className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-slate-800">Opțiuni de printare</h3>
                                <p className="truncate text-xs font-medium text-slate-600" title={file.name}>{file.name}</p>
                                {file.pages != null && (
                                  <p className="text-xs text-slate-500">
                                    {file.pages} pagini · <span className="font-semibold text-blue-600">{calculateFilePrice(file).toFixed(2)} lei</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="space-y-5">
                              {/* Print type */}
                              <div>
                                <p className="mb-2 text-sm font-semibold text-slate-700">Tip printare</p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "bw" } : f))}
                                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                                      opts.printMode === "bw"
                                        ? "bg-slate-800 text-white shadow-sm"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                                  >
                                    Alb-Negru
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "color" } : f))}
                                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                                      opts.printMode === "color"
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                                  >
                                    Color
                                  </button>
                                </div>
                                {opts.printMode === "color" && file.colorAnalysis && (
                                  <p className="mt-2 text-xs text-slate-500">
                                    Detectat: <span className="font-semibold text-blue-600">{file.colorAnalysis.colorPages}</span> color,{" "}
                                    <span className="font-semibold text-slate-700">{file.colorAnalysis.bwPages}</span> alb-negru
                                  </p>
                                )}
                              </div>

                              {/* Duplex */}
                              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 transition-colors hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={opts.duplex}
                                  onChange={(e) => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, duplex: e.target.checked } : f))}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-slate-700">Față-verso (Duplex)</span>
                              </label>

                              {/* Copies */}
                              <label className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-slate-700">Copii</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={opts.copies}
                                  onChange={(e) => {
                                    const raw = Number(e.target.value) || 1;
                                    const next = Math.min(50, Math.max(1, raw));
                                    setFiles((prev) => {
                                      const groups = getBindingGroups(prev);
                                      const group = groups.find((g) => g.filesInGroup.some((f) => f.id === file.id));
                                      if (!group || group.filesInGroup.length === 1) {
                                        return prev.map((f) => f.id === file.id ? { ...f, copies: next } : f);
                                      }
                                      const idsInGroup = new Set(group.filesInGroup.map((f) => f.id));
                                      return prev.map((f) => idsInGroup.has(f.id) ? { ...f, copies: next } : f);
                                    });
                                  }}
                                  className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                          <FileText className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700">Selectează un fișier din listă</p>
                        <p className="mt-1 text-xs text-slate-500">Click pe un fișier pentru a-l configura</p>
                      </div>
                    )}

                    {/* ─── Spiral / Binding options ─── */}
                    <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
                      <div>
                        <p className="mb-3 text-sm font-semibold text-slate-700">
                          Tip legare
                          {selectedGroupIndex !== null && bindingGroups[selectedGroupIndex]?.filesInGroup.length > 1 && (
                            <span className="ml-2 font-normal text-slate-500 text-xs">
                              ({bindingGroups[selectedGroupIndex].filesInGroup.length} fișiere legate)
                            </span>
                          )}
                        </p>
                        {/* 2×2 Grid instead of horizontal scroll */}
                        <div className="grid grid-cols-2 gap-2">
                          {spiralOptions.map(({ value, label, icon, description }) => {
                            const isCapsareDisabled = value === "capsare" && selectedGroupPages > 240;
                            return (
                              <label
                                key={value}
                                className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                                  isCapsareDisabled
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                                    : spiralType === value
                                    ? "cursor-pointer border-blue-500 bg-blue-50/90 text-blue-700 shadow-sm ring-2 ring-blue-500/20"
                                    : "cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                                title={isCapsareDisabled ? `Indisponibil (${selectedGroupPages} coli > 240)` : undefined}
                              >
                                <input
                                  type="radio"
                                  name="spiralType"
                                  value={value}
                                  checked={spiralType === value}
                                  disabled={isCapsareDisabled}
                                  onChange={() => {
                                    if (isCapsareDisabled) return;
                                    updateSelectedGroupOptions({ spiralType: value, ...(value !== "none" ? { spiralColor: "negru" } : {}) });
                                  }}
                                  className="sr-only"
                                />
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                                  isCapsareDisabled ? "text-slate-400 bg-slate-50" : spiralType === value ? "text-blue-600 bg-blue-100" : "text-slate-500 bg-slate-50"
                                }`}>
                                  {icon}
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-sm font-semibold leading-tight">{label}</span>
                                  <span className="block text-xs text-slate-500 leading-tight mt-0.5">
                                    {isCapsareDisabled ? `Indisponibil` : description}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Spiral color + cover options */}
                      {spiralType === "spirala" && (
                        <div className="space-y-4 rounded-xl border border-blue-200/80 bg-blue-50/40 p-4">
                          <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Culoare spirală</p>
                            <div className="flex items-center gap-4">
                              {spiralColorOptions.map(({ value, label, circleClass }) => (
                                <label key={value} className="flex cursor-pointer flex-col items-center gap-1.5" title={label}>
                                  <input type="radio" name="spiralColor" value={value} checked={spiralColor === value} onChange={() => updateSelectedGroupOptions({ spiralColor: value })} className="sr-only" />
                                  <span className={`flex h-10 w-10 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${spiralColor === value ? "ring-4 ring-blue-500 ring-offset-2" : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"} ${circleClass}`} />
                                  <span className="text-xs font-medium text-slate-600">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="mb-1 text-sm font-medium text-slate-700">Copertă față</p>
                            <p className="text-sm text-slate-500 italic">Transparent (standard)</p>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Copertă spate</p>
                            <div className="flex flex-wrap items-center gap-3">
                              {coverBackColors.map(({ value, label, circleClass }) => (
                                <label key={value} className="flex cursor-pointer flex-col items-center gap-1.5" title={label}>
                                  <input type="radio" name="coverBackColor" value={value} checked={coverBackColor === value} onChange={() => updateSelectedGroupOptions({ coverBackColor: value })} className="sr-only" />
                                  <span className={`flex h-10 w-10 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${coverBackColor === value ? "ring-4 ring-blue-500 ring-offset-2" : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"} ${circleClass}`} />
                                  <span className="text-xs font-medium text-slate-600">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Summary */}
                <section className="rounded-2xl bg-gradient-to-br from-blue-50/80 to-slate-50/80 p-4 ring-1 ring-slate-200/60 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rezumat</p>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-semibold text-slate-800">{totalPages}</span> pagini
                    {totalPages > 0 ? (
                      <>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-semibold text-blue-600">{totalPrice.toFixed(2)} lei</span> printare
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-semibold text-slate-800">{totalWithShipping.toFixed(2)} lei</span> total (incl. {SHIPPING_COST_LEI} lei transport)
                      </>
                    ) : (
                      <>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="text-slate-500">Transport: {SHIPPING_COST_LEI} lei</span>
                      </>
                    )}
                  </p>
                  {detectedColorPages > 0 && (
                    <p className="mt-1.5 text-xs text-slate-600">
                      Detectat: <span className="font-semibold text-blue-600">{detectedColorPages} color</span>
                      <span className="mx-1 text-slate-400">·</span>
                      <span className="font-semibold text-slate-700">{detectedBwPages} alb-negru</span>
                    </p>
                  )}
                  {orderSuccess && <p className="mt-1.5 text-xs font-medium text-green-700">{orderSuccess}</p>}
                  {checkoutError && !checkoutModalOpen && <p className="mt-1.5 text-xs font-medium text-red-600">{checkoutError}</p>}
                </section>
              </div>
            </div>
          </>
        )}

        {/* ─── Main CTA ─── */}
        <section className="mt-10 border-t border-slate-200/80 pt-8 pb-4">
          <div className="mx-auto max-w-2xl rounded-2xl bg-white px-6 py-6 shadow-[var(--shadow-lg)] ring-1 ring-slate-200/80 sm:px-8 sm:py-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                {totalPages > 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-600">Total comandă</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{totalWithShipping.toFixed(2)} lei</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {totalPrice.toFixed(2)} lei printare + {SHIPPING_COST_LEI} lei transport · {totalPages} pagini
                    </p>
                    {detectedColorPages > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Detectat: <span className="font-semibold text-blue-600">{detectedColorPages} pag. color</span>
                        {" · "}
                        <span className="font-semibold">{detectedBwPages} pag. alb-negru</span>
                      </p>
                    )}
                    {userChosenColorPages > 0 && detectedColorPages === 0 && (
                      <p className="mt-0.5 text-xs text-amber-600">
                        Toate paginile se taxează la tarif color (analiza automată indisponibilă).
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Adaugă fișiere PDF</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Încarcă documente pentru a vedea prețul total.
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={handleOpenCheckout}
                disabled={files.length === 0 || isCheckoutLoading || totalPages === 0}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-md shadow-blue-600/20 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <CreditCard className="h-5 w-5" />
                Finalizează comanda
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ Checkout modal ═══ */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/50 sm:p-8 animate-[fade-in_0.3s_ease-out]">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Finalizare comandă</h2>
              <button
                type="button"
                onClick={() => setCheckoutModalOpen(false)}
                className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Închide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 text-sm">
              {/* Upload progress */}
              <UploadProgressBar isUploading={isUploading} progress={uploadProgress} />

              {/* Order summary */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Rezumat comandă</p>
                <ul className="space-y-4">
                  {bindingGroups.map((group, groupIdx) => {
                    const opts = groupOptions[groupIdx] ?? defaultGroupOpts;
                    const spiralLabel = spiralOptions.find((o) => o.value === opts.spiralType)?.label ?? "Fără spirală";
                    const spiralColorLabel = opts.spiralType !== "none" ? spiralColorOptions.find((c) => c.value === opts.spiralColor)?.label ?? opts.spiralColor : null;
                    const coverBackLabel = coverBackColors.find((c) => c.value === opts.coverBackColor)?.label ?? opts.coverBackColor;
                    const isSingleDoc = group.filesInGroup.length === 1;
                    return (
                      <li key={group.groupIndex} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                        {!isSingleDoc && (
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Volum {groupIdx + 1} — {group.filesInGroup.length} documente
                          </p>
                        )}
                        {group.filesInGroup.map((f) => {
                          const printModeLabel = (f.printMode ?? "bw") === "color" ? "Color" : "Alb-negru";
                          const duplexLabel = f.duplex ? "Da" : "Nu";
                          return (
                            <div key={f.id} className={isSingleDoc ? "" : "ml-2 border-l-2 border-slate-200 pl-3 py-2"}>
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-slate-800">{f.name}</span>
                                <span className="text-xs font-semibold text-blue-600 tabular-nums shrink-0">{calculateFilePrice(f).toFixed(2)} lei</span>
                              </div>
                              {f.pages != null && <p className="mt-0.5 text-slate-500">{f.pages} pagini</p>}
                              <p className="mt-1 text-slate-600">
                                {printModeLabel} · Față-verso: {duplexLabel} · {f.copies} {f.copies === 1 ? "copie" : "copii"}
                              </p>
                            </div>
                          );
                        })}
                        <div className="mt-2 text-slate-600">
                          <p>
                            <span className="font-medium text-slate-700">Legare:</span> {spiralLabel}
                            {spiralColorLabel && `, ${spiralColorLabel}`}
                            {opts.spiralType === "spirala" && ` · Copertă: transparent / ${coverBackLabel}`}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal printare</span>
                    <span>{totalPrice.toFixed(2)} lei</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Transport</span>
                    <span>{SHIPPING_COST_LEI.toFixed(2)} lei</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Total</span>
                    <span>{totalWithShipping.toFixed(2)} lei</span>
                  </div>
                </div>
              </div>

              {/* Shipping form */}
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Date livrare <span className="text-red-500">*</span>
                </p>
                <div className="space-y-3">
                  {([
                    { key: "name" as const, label: "Nume complet", type: "text", placeholder: "Ex: Ion Popescu" },
                    { key: "phone" as const, label: "Telefon", type: "tel", placeholder: "Ex: 0712345678" },
                    { key: "email" as const, label: "Email", type: "email", placeholder: "email@exemplu.ro" },
                  ] as const).map(({ key, label, type, placeholder }) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-xs text-slate-500">{label} <span className="text-red-500">*</span></span>
                      <input
                        type={type}
                        required
                        value={shipping[key]}
                        onChange={(e) => {
                          setShipping((s) => ({ ...s, [key]: e.target.value }));
                          if (shippingErrors[key]) setShippingErrors((prev) => ({ ...prev, [key]: undefined }));
                        }}
                        placeholder={placeholder}
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                          shippingErrors[key] ? "border-red-400 focus:border-red-500 bg-red-50/50" : "border-slate-300 focus:border-blue-500"
                        }`}
                      />
                      {shippingErrors[key] && <p className="mt-1 text-xs text-red-600">{shippingErrors[key]}</p>}
                    </label>
                  ))}
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Adresă livrare <span className="text-red-500">*</span></span>
                    <textarea
                      required
                      value={shipping.address}
                      onChange={(e) => {
                        setShipping((s) => ({ ...s, address: e.target.value }));
                        if (shippingErrors.address) setShippingErrors((prev) => ({ ...prev, address: undefined }));
                      }}
                      placeholder="Strada, nr., localitate, județ, cod poștal"
                      rows={3}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        shippingErrors.address ? "border-red-400 focus:border-red-500 bg-red-50/50" : "border-slate-300 focus:border-blue-500"
                      }`}
                    />
                    {shippingErrors.address && <p className="mt-1 text-xs text-red-600">{shippingErrors.address}</p>}
                  </label>
                </div>
              </div>

              {/* Payment method */}
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">Modalitate plată</p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === "stripe"} onChange={() => setPaymentMethod("stripe")} className="h-4 w-4 text-blue-600" />
                    <div>
                      <span className="font-medium text-slate-800">Plată online (card)</span>
                      <p className="text-xs text-slate-500">Securizată prin Stripe · {totalWithShipping.toFixed(2)} lei</p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === "ramburs"} onChange={() => setPaymentMethod("ramburs")} className="h-4 w-4 text-blue-600" />
                    <div>
                      <span className="font-medium text-slate-800">Plată la livrare (ramburs)</span>
                      <p className="text-xs text-slate-500">Achit la curier · {totalWithShipping.toFixed(2)} lei</p>
                    </div>
                  </label>
                </div>
              </div>

              {checkoutError && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{checkoutError}</div>
              )}

              <button
                type="button"
                onClick={handleSubmitCheckout}
                disabled={isCheckoutLoading || isUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 transition-all duration-200"
              >
                {(isCheckoutLoading || isUploading) ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CreditCard className="h-5 w-5" />
                )}
                {isUploading
                  ? "Se încarcă fișierele…"
                  : isCheckoutLoading
                  ? "Se procesează..."
                  : paymentMethod === "ramburs"
                    ? `Confirmă comanda · ${totalWithShipping.toFixed(2)} lei`
                    : `Plătește ${totalWithShipping.toFixed(2)} lei online`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Order success (ramburs) ═══ */}
      {orderSuccessDetails && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8 animate-[fade-in_0.3s_ease-out]">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Comandă plasată cu succes!
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {orderSuccessDetails.paymentMethod === "ramburs"
                  ? "Vei plăti la livrare."
                  : "Plata a fost procesată."}
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Total pagini</span>
                <span className="font-medium">{orderSuccessDetails.totalPages}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total</span>
                <span className="font-bold text-slate-900">{orderSuccessDetails.totalWithShipping.toFixed(2)} lei</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOrderSuccessDetails(null)}
              className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Comandă nouă
            </button>
          </div>
        </div>
      )}

      {/* ═══ Preview modal ═══ */}
      {previewFileId && (() => {
        const file = files.find((f) => f.id === previewFileId);
        if (!file) return null;
        return (
          <div className="fixed inset-0 z-50 flex min-h-0 flex-col items-center overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm">
            <div className="flex max-h-[90vh] min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/50">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                    <FileText className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Preview document</p>
                    <p className="truncate text-xs text-slate-500">{file.name} {file.pages != null && `· ${file.pages} pagini`}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setPreviewFileId(null)} className="rounded-xl p-2.5 text-slate-500 hover:bg-white hover:text-slate-800" aria-label="Închide">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-slate-50/60 p-4 md:flex-row">
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
                  {file.previewUrl ? (
                    <iframe src={file.previewUrl} className="h-full min-h-[400px] w-full" title={`Preview ${file.name}`} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">Preview indisponibil</div>
                  )}
                </div>
                <div className="w-full shrink-0 space-y-5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:max-w-xs">
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-800">Setări fișier</p>
                    <div className="space-y-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500">Tip:</span>
                        <button type="button" onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "bw" } : f))} className={`rounded-full px-3 py-1 text-xs font-medium ${file.printMode === "bw" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>A/N</button>
                        <button type="button" onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "color" } : f))} className={`rounded-full px-3 py-1 text-xs font-medium ${file.printMode === "color" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Color</button>
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={file.duplex} onChange={(e) => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, duplex: e.target.checked } : f))} className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600" />
                        <span>Față-verso</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <span>Copii:</span>
                        <input type="number" min={1} max={50} value={file.copies} onChange={(e) => { const next = Number(e.target.value) || 1; setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, copies: Math.min(50, Math.max(1, next)) } : f)); }} className="w-16 rounded border border-slate-300 px-2 py-1 text-xs" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
