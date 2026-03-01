"use client";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Navbar,
  NavbarBrand,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";

type CircleType = "college" | "family" | "startup" | "gym" | "travel";
type ModalKey = "capture" | "met" | "person" | null;

type Person = {
  id: string;
  name: string;
  circle: CircleType;
  metAt: string;
  birthday: string;
  favoriteDrink: string;
  note: string;
  createdAt: string;
};

type Lore = {
  id: string;
  personId: string;
  eventDate: string;
  icon: string;
  visibility: "private" | "public";
  text: string;
  createdAt: string;
};

type Relation = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
};

type LorebookState = {
  people: Person[];
  loreEntries: Lore[];
  relations: Relation[];
};

type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const STORAGE_KEY = "lorebook-tree-v1";
const CIRCLE_OPTIONS: CircleType[] = ["college", "family", "startup", "gym", "travel"];
const CIRCLE_SET = new Set<CircleType>(CIRCLE_OPTIONS);
const PROMPTS = [
  { label: "birthday", icon: "BD", hint: "Birthday: " },
  { label: "drink", icon: "DR", hint: "Favorite drink: " },
  { label: "interest", icon: "IN", hint: "Interests: " },
  { label: "pets", icon: "PT", hint: "Pets: " },
  { label: "where we met", icon: "ME", hint: "Met at: " },
  { label: "quote", icon: "QT", hint: "Memorable quote: " },
];
const AVATAR_COLORS = ["#F2D9D9", "#E4DAF3", "#D5E9E3", "#F3E6CF", "#D8E0F4"];

function createId() {
  return crypto.randomUUID();
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeCircle(value: string): CircleType {
  if (CIRCLE_SET.has(value as CircleType)) return value as CircleType;
  return "college";
}

function formatDate(value: string) {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  return Math.abs(hash);
}

function avatarColor(name: string) {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function monthsAgo(isoDate: string) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24 * 30)));
}

function shouldIgnoreShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function readInitialState(): LorebookState {
  if (typeof window === "undefined") return { people: [], loreEntries: [], relations: [] };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { people: [], loreEntries: [], relations: [] };

  try {
    const parsed = JSON.parse(raw) as LorebookState;
    const people = (parsed.people ?? []).map((person) => ({
      id: safeString(person?.id) || createId(),
      name: safeString(person?.name),
      circle: normalizeCircle(safeString(person?.circle)),
      metAt: safeString(person?.metAt),
      birthday: safeString(person?.birthday),
      favoriteDrink: safeString(person?.favoriteDrink),
      note: safeString(person?.note),
      createdAt: safeString(person?.createdAt) || new Date().toISOString(),
    }));
    const loreEntries = (parsed.loreEntries ?? []).map((entry) => {
      const visibility: Lore["visibility"] = entry?.visibility === "public" ? "public" : "private";
      return {
        id: safeString(entry?.id) || createId(),
        personId: safeString(entry?.personId),
        eventDate: safeString(entry?.eventDate),
        icon: safeString(entry?.icon) || "MT",
        visibility,
        text: safeString(entry?.text),
        createdAt: safeString(entry?.createdAt) || new Date().toISOString(),
      };
    });
    const relations = (parsed.relations ?? []).map((edge) => ({
      id: safeString(edge?.id) || createId(),
      fromId: safeString(edge?.fromId),
      toId: safeString(edge?.toId),
      label: safeString(edge?.label),
    }));

    return {
      people,
      loreEntries,
      relations,
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { people: [], loreEntries: [], relations: [] };
  }
}

const EMPTY_STATE: LorebookState = { people: [], loreEntries: [], relations: [] };

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full text-[12px] font-semibold text-[#2E2E2E]"
      style={{ width: size, height: size, backgroundColor: avatarColor(name) }}
    >
      {initials(name)}
    </div>
  );
}

export default function Home() {
  const [initialState] = useState<LorebookState>(() => (typeof window === "undefined" ? EMPTY_STATE : readInitialState()));
  const [people, setPeople] = useState<Person[]>(initialState.people);
  const [loreEntries, setLoreEntries] = useState<Lore[]>(initialState.loreEntries);
  const [relations, setRelations] = useState<Relation[]>(initialState.relations);
  const [isHydrated, setIsHydrated] = useState(false);

  const [darkMode, setDarkMode] = useState(false);
  const [modal, setModal] = useState<ModalKey>(null);
  const [query, setQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [groupByCircle, setGroupByCircle] = useState(true);
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const [showPrivateLore, setShowPrivateLore] = useState(true);

  const [name, setName] = useState("");
  const [circle, setCircle] = useState<CircleType>("college");
  const [metAt, setMetAt] = useState("");
  const [birthday, setBirthday] = useState("");
  const [favoriteDrink, setFavoriteDrink] = useState("");
  const [personNote, setPersonNote] = useState("");

  const [capturePersonId, setCapturePersonId] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [captureIcon, setCaptureIcon] = useState("MT");
  const [captureVisibility, setCaptureVisibility] = useState<"private" | "public">("private");
  const [capturePlaceholder, setCapturePlaceholder] = useState("what happened?");

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [relationLabel, setRelationLabel] = useState("");

  const [metFlowMode, setMetFlowMode] = useState<"choose" | "existing" | "new">("choose");
  const [metFlowPersonId, setMetFlowPersonId] = useState("");

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const simRef = useRef<SimNode[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ people, loreEntries, relations } satisfies LorebookState));
  }, [isHydrated, people, loreEntries, relations]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "n" && !shouldIgnoreShortcut(event.target)) {
        event.preventDefault();
        setModal("capture");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const width = 1200;
    const height = 720;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(140, Math.min(width, height) * 0.32);

    const next = people.map((person, index) => {
      const prev = simRef.current.find((node) => node.id === person.id);
      if (prev) return prev;
      const angle = (Math.PI * 2 * index) / Math.max(people.length, 1);
      return { id: person.id, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0 };
    });

    simRef.current = next;
    setSimNodes(next.map((node) => ({ ...node })));
  }, [people]);

  useEffect(() => {
    let raf = 0;
    let frame = 0;

    const step = () => {
      const nodes = simRef.current;
      if (nodes.length > 1) {
        const byId = new Map(nodes.map((node) => [node.id, node]));
        for (const node of nodes) {
          node.vx *= 0.88;
          node.vy *= 0.88;
          node.vx += (600 - node.x) * 0.0009;
          node.vy += (360 - node.y) * 0.0009;
        }

        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const nx = dx / dist;
            const ny = dy / dist;

            const repel = 4200 / (dist * dist);
            a.vx -= nx * repel;
            a.vy -= ny * repel;
            b.vx += nx * repel;
            b.vy += ny * repel;

            const minDist = 82;
            if (dist < minDist) {
              const push = (minDist - dist) * 0.02;
              a.vx -= nx * push;
              a.vy -= ny * push;
              b.vx += nx * push;
              b.vy += ny * push;
            }
          }
        }

        for (const edge of relations) {
          const from = byId.get(edge.fromId);
          const to = byId.get(edge.toId);
          if (!from || !to) continue;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const spring = (dist - 260) * 0.0018;
          from.vx += dx * spring;
          from.vy += dy * spring;
          to.vx -= dx * spring;
          to.vy -= dy * spring;
        }

        for (const node of nodes) {
          node.x = Math.min(1120, Math.max(80, node.x + node.vx));
          node.y = Math.min(640, Math.max(80, node.y + node.vy));
        }

        frame += 1;
        if (frame % 2 === 0) setSimNodes(nodes.map((node) => ({ ...node })));
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [relations]);

  const palette = darkMode
    ? { bg: "#131218", card: "#1B1A20", border: "#302D36", accent: "#D46A6A", accentSecondary: "#E7B8C2", text: "#F3F3F3", muted: "#A9A4AE" }
    : { bg: "#F7F4F1", card: "#FFFFFF", border: "#E8E5E0", accent: "#D46A6A", accentSecondary: "#F0B8B8", text: "#1F1F1F", muted: "#6B6B6B" };

  const vars = {
    "--bg": palette.bg,
    "--card": palette.card,
    "--border": palette.border,
    "--accent": palette.accent,
    "--accent-secondary": palette.accentSecondary,
    "--text": palette.text,
    "--muted": palette.muted,
  } as React.CSSProperties;


  const inputClassNames = {
    base: "w-full",
    inputWrapper: "bg-[var(--card)] border border-[var(--border)] rounded-[12px] shadow-none transition-all duration-[160ms] ease-out data-[hover=true]:border-[var(--accent)] group-data-[focus=true]:border-[var(--accent)]",
    input: "text-[var(--text)] text-[14px] placeholder:text-[var(--muted)]",
    innerWrapper: "text-[var(--text)]",
    trigger: "bg-[var(--card)] border border-[var(--border)] rounded-[12px] min-h-11 shadow-none transition-all duration-[160ms] ease-out data-[hover=true]:border-[var(--accent)] data-[open=true]:border-[var(--accent)]",
    value: "text-[var(--text)] text-[14px]",
    popoverContent: "bg-[var(--card)] border border-[var(--border)] text-[var(--text)]",
    listbox: "bg-[var(--card)]",
    selectorIcon: "text-[var(--muted)]",
    description: "text-[var(--muted)]",
    errorMessage: "text-[var(--accent)]",
    label: "text-[12px] text-[#8A8A8A]",
  };

  const cardClass = "rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_10px_24px_rgba(0,0,0,0.08)] transition-all duration-[160ms] ease-out hover:-translate-y-[2px] hover:shadow-[0_14px_30px_rgba(0,0,0,0.12)]";
  const modalClassNames = {
    backdrop: "z-[90] bg-[rgba(0,0,0,0.25)] backdrop-blur-[6px]",
    wrapper: "z-[100] items-center justify-center px-4 py-6 sm:px-6",
    base: "mx-auto w-full max-w-[520px]",
  };
  const modalContentClass = "mx-auto w-full max-w-[520px] rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--text)] shadow-[0_20px_50px_rgba(0,0,0,0.35)]";
  const modalMotionProps = {
    variants: {
      enter: { opacity: 1, scale: 1, transition: { duration: 0.16, ease: "easeOut" } },
      exit: { opacity: 0, scale: 0.96, transition: { duration: 0.16, ease: "easeOut" } },
    },
    initial: "exit",
    animate: "enter",
    exit: "exit",
  } as const;

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((person) => safeString(person.name).toLowerCase().includes(q));
  }, [people, query]);

  const openPerson = useMemo(() => people.find((person) => person.id === openPersonId) ?? null, [openPersonId, people]);

  const openPersonLore = useMemo(() => {
    if (!openPerson) return [] as Lore[];
    return loreEntries
      .filter((entry) => entry.personId === openPerson.id)
      .sort((a, b) => (b.eventDate || b.createdAt).localeCompare(a.eventDate || a.createdAt));
  }, [openPerson, loreEntries]);

  const visibleLore = useMemo(() => openPersonLore.filter((entry) => showPrivateLore || entry.visibility !== "private"), [openPersonLore, showPrivateLore]);
  const latestMemory = openPersonLore[0] ?? null;

  const starters = useMemo(() => {
    if (!openPerson) return [] as string[];
    const out = new Set<string>();
    const joined = visibleLore.map((entry) => safeString(entry.text).toLowerCase()).join(" ");
    if (joined.includes("dog")) out.add("Ask about their dog.");
    if (joined.includes("pet")) out.add("Mention their pet.");
    if (joined.includes("birthday") || openPerson.birthday) out.add("Follow up on their birthday.");
    if (latestMemory) {
      const m = monthsAgo(latestMemory.eventDate || latestMemory.createdAt);
      out.add(`You last met them ${m > 0 ? `${m} month${m > 1 ? "s" : ""}` : "recently"} ago.`);
    }
    out.add("Ask about their recent project.");
    return Array.from(out).slice(0, 4);
  }, [openPerson, visibleLore, latestMemory]);

  const recentMemories = useMemo(() => loreEntries.slice().sort((a, b) => (b.eventDate || b.createdAt).localeCompare(a.eventDate || a.createdAt)).slice(0, 8), [loreEntries]);

  const circleGroups = useMemo(() => {
    const groups: Record<CircleType, Person[]> = { college: [], family: [], startup: [], gym: [], travel: [] };
    for (const person of people) groups[normalizeCircle(person.circle)].push(person);
    return groups;
  }, [people]);

  const globalResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return { people: [] as Person[], memories: [] as Lore[], connections: [] as Relation[] };
    const peopleHits = people.filter((person) => safeString(person.name).toLowerCase().includes(q) || safeString(person.circle).toLowerCase().includes(q) || safeString(person.metAt).toLowerCase().includes(q));
    const memoryHits = loreEntries.filter((entry) => {
      const personName = safeString(people.find((person) => person.id === entry.personId)?.name);
      return safeString(entry.text).toLowerCase().includes(q) || safeString(entry.icon).toLowerCase().includes(q) || personName.toLowerCase().includes(q);
    });
    const connectionHits = relations.filter((edge) => {
      const from = safeString(people.find((person) => person.id === edge.fromId)?.name);
      const to = safeString(people.find((person) => person.id === edge.toId)?.name);
      return safeString(edge.label).toLowerCase().includes(q) || from.toLowerCase().includes(q) || to.toLowerCase().includes(q);
    });
    return { people: peopleHits, memories: memoryHits.slice(0, 8), connections: connectionHits };
  }, [globalQuery, people, loreEntries, relations]);

  const nodeById = useMemo(() => new Map(simNodes.map((node) => [node.id, node])), [simNodes]);

  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hoveredNodeId) return ids;
    for (const edge of relations) {
      if (edge.fromId === hoveredNodeId) ids.add(edge.toId);
      if (edge.toId === hoveredNodeId) ids.add(edge.fromId);
    }
    return ids;
  }, [hoveredNodeId, relations]);

  const addLore = (payload: { personId: string; text: string; icon?: string; visibility?: "private" | "public" }) => {
    if (!payload.personId || !payload.text.trim()) return;
    setLoreEntries((prev) => [{ id: createId(), personId: payload.personId, eventDate: new Date().toISOString().slice(0, 10), icon: payload.icon || "MT", visibility: payload.visibility || "private", text: payload.text.trim(), createdAt: new Date().toISOString() }, ...prev]);
  };

  const handleSavePerson = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const person: Person = { id: createId(), name: trimmed, circle, metAt: metAt.trim(), birthday, favoriteDrink: favoriteDrink.trim(), note: personNote.trim(), createdAt: new Date().toISOString() };
    setPeople((prev) => [person, ...prev]);
    setName("");
    setCircle("college");
    setMetAt("");
    setBirthday("");
    setFavoriteDrink("");
    setPersonNote("");
    setCapturePersonId(person.id);
    setCaptureText("");
    setCaptureIcon("MT");
    setCaptureVisibility("private");
    setCapturePlaceholder("what happened first?");
    setModal("capture");
  };

  const handleSaveCapture = () => {
    addLore({ personId: capturePersonId, text: captureText, icon: captureIcon, visibility: captureVisibility });
    setCapturePersonId("");
    setCaptureText("");
    setCaptureIcon("MT");
    setCaptureVisibility("private");
    setCapturePlaceholder("what happened?");
    setModal(null);
  };

  const handleConnect = () => {
    if (!fromId || !toId || fromId === toId || !relationLabel.trim()) return;
    setRelations((prev) => [{ id: createId(), fromId, toId, label: relationLabel.trim() }, ...prev]);
    setRelationLabel("");
  };

  const handleGraphWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const zoom = event.deltaY > 0 ? 0.94 : 1.06;
    setViewport((prev) => {
      const scale = Math.min(2.4, Math.max(0.6, prev.scale * zoom));
      const gx = (px - prev.x) / prev.scale;
      const gy = (py - prev.y) / prev.scale;
      return { scale, x: px - gx * scale, y: py - gy * scale };
    });
  };

  const handleCloseModals = () => {
    setModal(null);
    setMetFlowMode("choose");
    setMetFlowPersonId("");
  };

  const selectItemClass =
    "text-[var(--text)] data-[hover=true]:bg-[var(--accent-secondary)]/25 data-[selected=true]:bg-[var(--accent-secondary)]/30 data-[selected=true]:text-[var(--text)]";

  if (!isHydrated) {
    return <div style={vars} className="min-h-screen bg-[var(--bg)]" />;
  }

  return (
    <div style={vars} className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-[family-name:var(--font-inter)] font-medium">
      <Navbar className="bg-transparent px-4 py-4 sm:px-10">
        <NavbarBrand>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-secondary)] text-[12px] font-semibold text-[#2E2E2E]">MM</div>
            <p className="font-[family-name:var(--font-playfair)] text-[20px] leading-tight">Memora</p>
          </div>
        </NavbarBrand>
        <div className="flex items-center gap-2">
          {[
            ["people", "People"],
            ["graph", "Graph"],
            ["insights", "Insights"],
          ].map(([id, label]) => (
            <button key={id} type="button" className="rounded-[12px] px-3 py-2 text-[14px] text-[var(--muted)] transition hover:bg-[var(--accent-secondary)]/25 hover:text-[var(--text)]" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</button>
          ))}
          <Switch size="sm" isSelected={darkMode} onValueChange={setDarkMode}>dark</Switch>
        </div>
      </Navbar>

      <main className={`mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-20 transition-all duration-[160ms] ease-out sm:px-8 ${modal ? "opacity-55 blur-[1.2px]" : "opacity-100 blur-0"}`}>
        <section className={`${cardClass} py-8`}>
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="space-y-4">
              <h1 className="font-[family-name:var(--font-playfair)] text-[44px] leading-[1.15]">Memora</h1>
              <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--muted)]">A clean relationship dashboard for memory, context, and better conversations.</p>
            </div>
            <div className="w-full max-w-sm">
              <Input label="Global Search" placeholder="Search people, memories, connections" value={globalQuery} onValueChange={setGlobalQuery} classNames={inputClassNames} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Global Results</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-4 p-0 text-[14px] leading-relaxed">
              <div>
                <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">People</p>
                {globalResults.people.length === 0 ? <p className="text-[var(--muted)]">No people match.</p> : globalResults.people.slice(0, 5).map((person) => <p key={person.id}>- {person.name}</p>)}
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">Memories</p>
                {globalResults.memories.length === 0 ? <p className="text-[var(--muted)]">No memories match.</p> : globalResults.memories.slice(0, 5).map((entry) => <p key={entry.id}>- {entry.text.slice(0, 44)}</p>)}
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">Connections</p>
                {globalResults.connections.length === 0 ? <p className="text-[var(--muted)]">No connections match.</p> : globalResults.connections.slice(0, 5).map((edge) => <p key={edge.id}>- {edge.label}</p>)}
              </div>
            </CardBody>
          </Card>

          <Card className={`${cardClass} lg:col-span-2`}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Recent Memories</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-3 p-0">
              {recentMemories.length === 0 ? (
                <p className="text-[14px] text-[var(--muted)]">No memories yet. Add your first moment.</p>
              ) : (
                recentMemories.map((entry) => {
                  const personName = people.find((person) => person.id === entry.personId)?.name ?? "Unknown";
                  return (
                    <div key={entry.id} className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)] transition-all duration-[160ms] ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_20px_rgba(0,0,0,0.08)]">
                      <p className="text-[12px] text-[#8A8A8A]">{formatDate(entry.eventDate || entry.createdAt)} • {personName}</p>
                      <p className="mt-2 text-[14px] leading-relaxed">{entry.icon} {entry.text}</p>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </section>

        <section id="people" className="grid gap-6 lg:grid-cols-3">
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Add Person</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-4 p-0">
              <Input label="Name" value={name} onValueChange={setName} classNames={inputClassNames} />
              <Select label="Circle" selectedKeys={[circle]} classNames={inputClassNames} onSelectionChange={(keys) => {
                if (keys === "all") return;
                const first = Array.from(keys)[0];
                if (first === "college" || first === "family" || first === "startup" || first === "gym" || first === "travel") setCircle(first);
              }}>{CIRCLE_OPTIONS.map((option) => <SelectItem key={option} className={selectItemClass}>{option}</SelectItem>)}</Select>
              <Input label="Where we met" value={metAt} onValueChange={setMetAt} classNames={inputClassNames} />
              <Input type="date" label="Birthday" value={birthday} onValueChange={setBirthday} classNames={inputClassNames} />
              <Input label="Favorite drink" value={favoriteDrink} onValueChange={setFavoriteDrink} classNames={inputClassNames} />
              <Textarea label="Notes" value={personNote} onValueChange={setPersonNote} minRows={2} classNames={inputClassNames} />
              <Button className="h-11 rounded-[12px] bg-[var(--accent)] px-5 text-white transition hover:scale-[1.02]" onPress={handleSavePerson}>Save Person</Button>
            </CardBody>
          </Card>

          <Card className={`${cardClass} lg:col-span-2`}>
            <CardHeader className="flex items-center justify-between p-0">
              <p className="text-[20px] font-semibold leading-tight">People</p>
              <Switch isSelected={groupByCircle} onValueChange={setGroupByCircle} size="sm">group by circle</Switch>
            </CardHeader>
            <CardBody className="mt-6 flex flex-col gap-4 p-0">
              <Input label="Search people" value={query} onValueChange={setQuery} classNames={inputClassNames} />
              {!groupByCircle ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredPeople.map((person) => (
                    <button key={person.id} type="button" onClick={() => { setOpenPersonId(person.id); setModal("person"); }} className="flex items-center gap-3 rounded-[16px] border border-[var(--border)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-secondary)]/20">
                      <Avatar name={person.name} size={36} />
                      <div>
                        <p className="text-[16px] font-medium leading-snug">{person.name}</p>
                        <Badge className="mt-1 rounded-full bg-[var(--accent-secondary)] px-2 py-0.5 text-[12px] text-[var(--text)]">{person.circle}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {CIRCLE_OPTIONS.map((circleName) => (
                    <div key={circleName} className="rounded-[16px] border border-[var(--border)] p-4">
                      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{circleName}</p>
                      {circleGroups[circleName].length === 0 ? (
                        <p className="text-[14px] text-[var(--muted)]">No people here yet.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {circleGroups[circleName].map((person) => (
                            <button key={person.id} type="button" onClick={() => { setOpenPersonId(person.id); setModal("person"); }} className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] px-3 py-2 text-left transition hover:border-[var(--accent)]">
                              <Avatar name={person.name} size={36} />
                              <span className="text-[14px]">{person.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Memory Capture</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-4 p-0">
              <div className="flex flex-wrap gap-2">
                {PROMPTS.map((prompt) => (
                  <button key={prompt.label} type="button" className="rounded-full border border-[var(--border)] px-3 py-1 text-[12px] transition hover:border-[var(--accent)]" onClick={() => { setCaptureIcon(prompt.icon); setCapturePlaceholder(prompt.hint); setModal("capture"); }}>{prompt.label}</button>
                ))}
              </div>
              <p className="text-[14px] text-[var(--muted)]">One fast flow for all memories. Press N to open capture anytime.</p>
              <Button className="h-11 rounded-[12px] bg-[var(--accent)] px-5 text-white transition hover:scale-[1.02]" onPress={() => setModal("capture")}>Open Capture</Button>
            </CardBody>
          </Card>
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Connect People</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-4 p-0">
              <Select label="From" selectedKeys={fromId ? [fromId] : []} classNames={inputClassNames} onSelectionChange={(keys) => {
                if (keys === "all") return;
                const first = Array.from(keys)[0];
                if (typeof first === "string") setFromId(first);
              }}>{people.map((person) => <SelectItem key={person.id} className={selectItemClass}>{person.name}</SelectItem>)}</Select>
              <Select label="To" selectedKeys={toId ? [toId] : []} classNames={inputClassNames} onSelectionChange={(keys) => {
                if (keys === "all") return;
                const first = Array.from(keys)[0];
                if (typeof first === "string") setToId(first);
              }}>{people.map((person) => <SelectItem key={person.id} className={selectItemClass}>{person.name}</SelectItem>)}</Select>
              <Input label="Relationship" value={relationLabel} onValueChange={setRelationLabel} classNames={inputClassNames} />
              <Button className="h-11 rounded-[12px] border border-[var(--accent)] bg-transparent px-5 text-[var(--accent)] transition hover:scale-[1.02] hover:bg-[var(--accent-secondary)]/20" onPress={handleConnect}>Add Connection</Button>
            </CardBody>
          </Card>
        </section>

        <section id="graph">
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Relationship Graph</CardHeader>
            <CardBody className="mt-6 p-0">
              <div className="relative h-[560px] overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg)]">
                {people.length === 0 ? (
                  <div className="absolute inset-0 grid place-items-center p-8 text-center"><div><p className="text-[16px] font-medium">Your relationship map will appear here.</p><p className="mt-2 text-[14px] text-[var(--muted)]">Add people and links to start the graph.</p></div></div>
                ) : (
                  <svg viewBox="0 0 1200 720" className="h-full w-full touch-none cursor-grab active:cursor-grabbing" onWheel={handleGraphWheel} onPointerDown={(event) => { dragRef.current = { active: true, startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragRef.current.active) return; const dx = event.clientX - dragRef.current.startX; const dy = event.clientY - dragRef.current.startY; setViewport((prev) => ({ ...prev, x: dragRef.current.originX + dx, y: dragRef.current.originY + dy })); }} onPointerUp={(event) => { dragRef.current.active = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerLeave={() => { dragRef.current.active = false; }}>
                    <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
                      {relations.map((edge) => {
                        const from = nodeById.get(edge.fromId);
                        const to = nodeById.get(edge.toId);
                        if (!from || !to) return null;
                        const mx = (from.x + to.x) / 2;
                        const my = (from.y + to.y) / 2;
                        const nx = -(to.y - from.y);
                        const ny = to.x - from.x;
                        const len = Math.hypot(nx, ny) || 1;
                        const cx = mx + (nx / len) * 24;
                        const cy = my + (ny / len) * 24;
                        const highlighted = Boolean(hoveredNodeId && (edge.fromId === hoveredNodeId || edge.toId === hoveredNodeId || connectedNodeIds.has(edge.fromId) || connectedNodeIds.has(edge.toId)));
                        return (
                          <g key={edge.id}>
                            <path d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`} fill="none" stroke={highlighted ? "var(--accent)" : "var(--border)"} strokeWidth={highlighted ? 4.2 : 3} strokeLinecap="round" opacity={highlighted ? 1 : 0.62} className="transition-all duration-150" />
                            <text x={mx} y={my - 10} textAnchor="middle" fontSize="12" fill="var(--muted)">{edge.label}</text>
                          </g>
                        );
                      })}

                      {simNodes.map((node) => {
                        const person = people.find((p) => p.id === node.id);
                        if (!person) return null;
                        const active = !hoveredNodeId || node.id === hoveredNodeId || connectedNodeIds.has(node.id);
                        return (
                          <g key={node.id} transform={`translate(${node.x} ${node.y}) scale(${node.id === hoveredNodeId ? 1.08 : 1})`} onMouseEnter={() => setHoveredNodeId(node.id)} onMouseLeave={() => setHoveredNodeId(null)} onClick={() => { setOpenPersonId(node.id); setModal("person"); }} className="cursor-pointer transition-all duration-[140ms]">
                            <circle r="32" fill="var(--card)" stroke="var(--accent)" strokeWidth="2.8" opacity={active ? 1 : 0.5} filter={node.id === hoveredNodeId ? "drop-shadow(0 0 14px rgba(212,106,106,0.55))" : undefined} />
                            <circle r="18" fill={avatarColor(person.name)} opacity={0.95} />
                            <text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">{initials(person.name)}</text>
                            <text y="54" textAnchor="middle" fontSize="12" fill="var(--muted)">{person.name.slice(0, 18)}</text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                )}
              </div>
            </CardBody>
          </Card>
        </section>

        <section id="insights" className="grid gap-6 md:grid-cols-2">
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Conversation Suggestions</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-3 p-0">
              {openPerson ? (starters.length === 0 ? <p className="text-[14px] text-[var(--muted)]">Memora will suggest ideas here once you log interactions.</p> : starters.map((line) => <p key={line} className="text-[14px] leading-relaxed text-[var(--muted)]"><span className="mr-2">•</span>{line}</p>)) : <p className="text-[14px] text-[var(--muted)]">Memora will suggest ideas here once you log interactions.</p>}
            </CardBody>
          </Card>
          <Card className={cardClass}>
            <CardHeader className="p-0 text-[20px] font-semibold leading-tight">Activity</CardHeader>
            <CardBody className="mt-6 flex flex-col gap-3 p-0">
              {recentMemories.length === 0 ? <p className="text-[14px] text-[var(--muted)]">No memories yet. Add your first moment.</p> : recentMemories.slice(0, 4).map((entry) => <div key={entry.id} className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)] transition-all duration-[160ms] ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_20px_rgba(0,0,0,0.08)]"><p className="text-[12px] text-[#8A8A8A]">{formatDate(entry.eventDate || entry.createdAt)}</p><p className="mt-2 text-[14px] leading-relaxed">{entry.icon} {entry.text}</p></div>)}
            </CardBody>
          </Card>
        </section>
      </main>

      <Button className="fixed bottom-6 right-6 z-40 h-14 rounded-full bg-[var(--accent)] px-7 text-white shadow-[0_16px_28px_rgba(0,0,0,0.28)] transition duration-150 hover:-translate-y-0.5 hover:scale-[1.05]" onPress={() => setModal("capture")}>+ memory</Button>
      <Button className="fixed bottom-24 right-6 z-40 h-12 rounded-full border border-[var(--accent)] bg-[var(--card)] px-5 text-[var(--accent)] shadow-[0_12px_22px_rgba(0,0,0,0.18)] transition duration-150 hover:-translate-y-0.5 hover:scale-[1.05]" onPress={() => { setMetFlowMode("choose"); setModal("met"); }}>met someone?</Button>

      <Modal isOpen={modal === "capture"} onOpenChange={(open) => !open && handleCloseModals()} backdrop="opaque" classNames={modalClassNames} motionProps={modalMotionProps}>
        <ModalContent className={modalContentClass}>
          {(onClose) => (
            <>
              <ModalHeader className="px-7 pt-7 text-[20px] font-semibold leading-tight">Capture Memory</ModalHeader>
              <ModalBody className="gap-4 px-7 py-4">
                <p className="text-[12px] text-[var(--muted)]">Press N to capture memory</p>
                <Select label="Person" selectedKeys={capturePersonId ? [capturePersonId] : []} classNames={inputClassNames} onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const first = Array.from(keys)[0];
                  if (typeof first === "string") setCapturePersonId(first);
                }}>{people.map((person) => <SelectItem key={person.id} className={selectItemClass}>{person.name}</SelectItem>)}</Select>
                <Textarea label="Memory" placeholder={capturePlaceholder} value={captureText} onValueChange={setCaptureText} minRows={4} classNames={inputClassNames} />
                <Input label="Icon (optional)" value={captureIcon} onValueChange={setCaptureIcon} classNames={inputClassNames} />
                <Select label="Visibility (optional)" selectedKeys={[captureVisibility]} classNames={inputClassNames} onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const first = Array.from(keys)[0];
                  if (first === "private" || first === "public") setCaptureVisibility(first);
                }}>
                  <SelectItem key="private" className={selectItemClass}>private</SelectItem>
                  <SelectItem key="public" className={selectItemClass}>public</SelectItem>
                </Select>
              </ModalBody>
              <ModalFooter className="px-7 pb-7">
                <Button className="h-11 rounded-[12px] border border-[var(--accent)] bg-transparent px-5 text-[var(--accent)]" onPress={() => { onClose(); handleCloseModals(); }}>Cancel</Button>
                <Button className="h-11 rounded-[12px] bg-[var(--accent)] px-5 text-white" onPress={handleSaveCapture}>Save</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={modal === "met"} onOpenChange={(open) => !open && handleCloseModals()} backdrop="opaque" classNames={modalClassNames} motionProps={modalMotionProps}>
        <ModalContent className={modalContentClass}>
          <ModalHeader className="px-7 pt-7 text-[20px] font-semibold leading-tight">Met Someone?</ModalHeader>
          <ModalBody className="gap-4 px-7 py-4">
            {metFlowMode === "choose" ? (
              <>
                <Button className="h-11 w-full justify-center rounded-[12px] bg-[var(--accent)] px-5 text-white" onPress={() => setMetFlowMode("existing")}>Already in database</Button>
                <Button className="h-11 w-full justify-center rounded-[12px] border border-[var(--accent)] bg-transparent px-5 text-[var(--accent)]" onPress={() => setMetFlowMode("new")}>New person</Button>
              </>
            ) : null}
            {metFlowMode === "existing" ? (
              <>
                <Select label="Person" selectedKeys={metFlowPersonId ? [metFlowPersonId] : []} classNames={inputClassNames} onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const first = Array.from(keys)[0];
                  if (typeof first === "string") setMetFlowPersonId(first);
                }}>{people.map((person) => <SelectItem key={person.id} className={selectItemClass}>{person.name}</SelectItem>)}</Select>
                <div className="flex gap-2">
                  <Button className="h-11 rounded-[12px] border border-[var(--accent)] bg-transparent text-[var(--accent)]" onPress={() => setMetFlowMode("choose")}>Back</Button>
                  <Button className="h-11 rounded-[12px] bg-[var(--accent)] text-white" onPress={() => { setCapturePersonId(metFlowPersonId); setModal("capture"); }}>Continue</Button>
                </div>
              </>
            ) : null}
            {metFlowMode === "new" ? (
              <>
                <Input label="Name" value={name} onValueChange={setName} classNames={inputClassNames} />
                <Select label="Circle" selectedKeys={[circle]} classNames={inputClassNames} onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const first = Array.from(keys)[0];
                  if (first === "college" || first === "family" || first === "startup" || first === "gym" || first === "travel") setCircle(first);
                }}>{CIRCLE_OPTIONS.map((option) => <SelectItem key={option} className={selectItemClass}>{option}</SelectItem>)}</Select>
                <div className="flex gap-2">
                  <Button className="h-11 rounded-[12px] border border-[var(--accent)] bg-transparent text-[var(--accent)]" onPress={() => setMetFlowMode("choose")}>Back</Button>
                  <Button className="h-11 rounded-[12px] bg-[var(--accent)] text-white" onPress={handleSavePerson}>Save person</Button>
                </div>
              </>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={modal === "person" && Boolean(openPerson)} onOpenChange={(open) => { if (!open) { setOpenPersonId(null); handleCloseModals(); } }} backdrop="opaque" classNames={modalClassNames} motionProps={modalMotionProps}>
        <ModalContent className={modalContentClass}>
          {(onClose) => (
            <>
              <ModalHeader className="px-7 pb-3 pt-7">
                <div className="w-full space-y-5">
                  <div className="flex items-center gap-4">
                    <Avatar name={openPerson?.name ?? "?"} size={64} />
                    <div>
                      <p className="font-[family-name:var(--font-playfair)] text-[44px] leading-[1.1]">{openPerson?.name}</p>
                      <Badge className="mt-2 rounded-full bg-[var(--accent-secondary)] px-3 py-1 text-[12px] text-[var(--text)]">{openPerson?.circle || "circle"}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-[12px] border border-[var(--border)] p-3"><p className="text-[12px] text-[#8A8A8A]">BD birthday</p><p className="mt-1 text-[14px] leading-relaxed">{openPerson?.birthday || "not set"}</p></div>
                    <div className="rounded-[12px] border border-[var(--border)] p-3"><p className="text-[12px] text-[#8A8A8A]">DR drink</p><p className="mt-1 text-[14px] leading-relaxed">{openPerson?.favoriteDrink || "not set"}</p></div>
                    <div className="rounded-[12px] border border-[var(--border)] p-3"><p className="text-[12px] text-[#8A8A8A]">ME met</p><p className="mt-1 text-[14px] leading-relaxed">{openPerson?.metAt || "not set"}</p></div>
                    <div className="rounded-[12px] border border-[var(--border)] p-3"><p className="text-[12px] text-[#8A8A8A]">LM last</p><p className="mt-1 text-[14px] leading-relaxed">{latestMemory ? latestMemory.text.slice(0, 32) : "none yet"}</p></div>
                  </div>
                </div>
              </ModalHeader>

              <ModalBody className="space-y-6 px-7 py-4">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[20px] leading-tight">Conversation</p>
                    <Switch size="sm" isSelected={showPrivateLore} onValueChange={setShowPrivateLore}>show private</Switch>
                  </div>
                  {starters.length === 0 ? <p className="text-[14px] text-[var(--muted)]">Memora will suggest ideas here once you log interactions.</p> : starters.map((line) => <p key={line} className="text-[14px] leading-relaxed text-[var(--muted)]"><span className="mr-2">•</span>{line}</p>)}
                </section>

                <section className="space-y-3">
                  <p className="text-[20px] leading-tight">Timeline</p>
                  {visibleLore.length === 0 ? <p className="text-[14px] text-[var(--muted)]">No memories yet. Add your first moment.</p> : (
                    <div className="flex flex-col gap-3">
                      {visibleLore.slice(0, 8).map((entry) => (
                        <div key={entry.id} className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)] transition-all duration-[160ms] ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_20px_rgba(0,0,0,0.08)]">
                          <p className="text-[12px] text-[#8A8A8A]">{formatDate(entry.eventDate || entry.createdAt)}</p>
                          <p className="mt-2 text-[14px] leading-relaxed">{entry.icon} {entry.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </ModalBody>

              <ModalFooter className="px-7 pb-7 pt-3">
                <Button className="h-11 rounded-[12px] border border-[var(--accent)] bg-transparent px-5 text-[var(--accent)]" onPress={() => { onClose(); setOpenPersonId(null); handleCloseModals(); }}>Close</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
