import { useI18n } from "../../i18n/useI18n";
import { getFaviconForDomain } from '../utils/url';
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Fuse from "fuse.js";
import { db } from "../db";
import type { SavedTab } from "../db";
import type { ViewMode } from "../App";
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";
import { SparklesIcon, DocumentTextIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { isToday, isYesterday } from "date-fns";

function formatTabTitle(title: string): string {
  if (!title) return "";
  const words = title.trim().split(/\s+/);
  const twoWords = words.slice(0, 2).join(" ");
  if (twoWords.length > 10) {
    return `${twoWords.slice(0, 10)}...`;
  }
  return words.length > 2 ? `${twoWords}...` : twoWords;
}



// ─── Upgraded Tooltip (Using React Portals) ─────────────────
function Tooltip({ title, url, children }: {
  title: string; url: string; children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('pointerdown', dismiss, true);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('pointerdown', dismiss, true);
    };
  }, [visible]);

  useEffect(() => {
    if (visible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        left: rect.left,
        top: rect.top - 8, // 8px gap above the element
      });
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClickCapture={() => setVisible(false)}
      onKeyDownCapture={() => setVisible(false)}
    >
      {children}
      
      {/* Render the tooltip at the body level to escape overflow limits */}
      {visible && createPortal(
        <div style={{
          position: "fixed",
          bottom: `calc(100vh - ${coords.top}px)`,
          left: "50%",
transform: "translateX(-50%)",
          background: "var(--bg-color)",
          border: "1px solid rgba(90,90,95,0.35)",
          borderRadius: "10px", 
          padding: "9px 12px",
          minWidth: "200px", 
          maxWidth: "280px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          zIndex: 9999, 
          pointerEvents: "none",
        }}>
          <div style={{
            fontSize: "12px", fontWeight: 600,
            color: "var(--text-color)", marginBottom: "4px",
            lineHeight: "1.4",
          }}>
            {title}
          </div>
          <div style={{
            fontSize: "10.5px", color: "var(--placeholder-color)",
            wordBreak: "break-all", lineHeight: "1.4",
          }}>
            {url}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function TabFavicon({ tab, size = 20 }: { tab: SavedTab; size?: number }) {
  const [err, setErr] = useState(false);
  const src = err ? chrome.runtime.getURL('icons/icon-16.png') : getFaviconForDomain(tab.domain);
  return (
    <img
      src={src}
      width={size} height={size}
      style={{ borderRadius: "5px", flexShrink: 0, display: "block" }}
      onError={() => setErr(true)}
    />
  );
}



// ─── Tag Pill ───────────────────────────────────────────────

function TagPill({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: "10px", padding: "2px 7px", borderRadius: "20px",
      background: "rgba(120,120,200,0.15)",
      border: "1px solid rgba(120,120,200,0.22)",
      color: "var(--text-color)", fontWeight: 500, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ─── List Row ───────────────────────────────────────────────

function TabRowList({
  tab,
  onMenu,
}: {
  tab: SavedTab;
  onMenu?: (tab: SavedTab) => void;
  mode?: "default" | "notes";
}) {

  const { t: tr, formatDate } = useI18n();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "7px 10px",
        gap: "6px",
        borderTop: "1px solid var(--border-color)",
        background: hovered ? "var(--row-hover)" : "transparent",
        transition: "background 0.15s ease",
        width: "100%",
        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      {/* Left side: Branch, Favicon, Title, Badges */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Sleek branch icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--placeholder-color)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, opacity: 0.6 }}
        >
          <path d="M 4 1 V 9 A 3 3 0 0 0 7 12 H 14" />
          <polyline points="11 9 14 12 11 15" />
        </svg>

        {/* Favicon */}
        <Tooltip title={tab.title} url={tab.url}>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <TabFavicon tab={tab} size={16} />
          </div>
        </Tooltip>

        {/* Max 2-word Title (Bounded to limited area) */}
        <div style={{ minWidth: 0, flex: "0 1 auto", overflow: "hidden" }}>
          <Tooltip title={tab.title} url={tab.url}>
            <span
              onClick={() => chrome.tabs.create({ url: tab.url })}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-color)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: "pointer",
                display: "block",
                maxWidth: "75px",
              }}
            >
              {formatTabTitle(tab.title)}
            </span>
          </Tooltip>
        </div>

        {/* Pin Badge */}
        {tab.pinned && (
          <span style={{ fontSize: "11px", flexShrink: 0 }} title={tr("tabs.pinned")}>📌</span>
        )}

        {/* Note Badge with crisp Note icon */}
        {tab.notes && (
          <Tooltip title={tr("common.note")} url={tab.notes}>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onMenu?.(tab);
              }}
              title={tab.notes}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "18px",
                height: "18px",
                borderRadius: "5px",
                background: "rgba(167, 139, 250, 0.18)",
                color: "#a78bfa",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <DocumentTextIcon style={{ width: "12px", height: "12px" }} />
            </span>
          </Tooltip>
        )}
      </div>

      {/* Right side: Date, 3-dots button (Stationary, Aligned, Clean) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginInlineStart: "auto",
          flexShrink: 0,
        }}
      >
        {/* Date */}
        <span
          style={{
            fontSize: "10.5px",
            color: "var(--placeholder-color)",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatDate(tab.createdAt)}
        </span>

        {/* Crisp, stationary 3-dots menu button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu?.(tab);
          }}
          title={tr("common.moreOptions")}
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            padding: 0,
            color: "var(--text-color)",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--btn-hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <EllipsisVerticalIcon
            style={{
              width: "16px",
              height: "16px",
            }}
          />
        </button>
      </div>
    </div>
  );
}
// ─── Grid Card ──────────────────────────────────────────────

function TabCardGrid({ tab, onMenu }: { tab: SavedTab; onMenu?: (tab: SavedTab) => void }) {
  const { t: tr } = useI18n();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => chrome.tabs.create({ url: tab.url })}
      style={{
        borderRadius: "12px",
        border: "1px solid var(--folder-border)",
        background: hovered ? "var(--row-hover)" : "var(--card-bg)",
        padding: "12px", cursor: "pointer",
        transition: "all 0.15s ease",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered ? "0 4px 12px rgba(0,0,0,0.12)" : "0 1px 3px rgba(0,0,0,0.04)",
        position: "relative",
        display: "flex", flexDirection: "column", gap: "8px",
      }}
    >
      {/* Top Row: Favicon, Domain (suburl), and Options */}
      <div style={{ display: "flex", alignItems: "center", gap: "7px", width: "100%" }}>
        <Tooltip title={tab.title} url={tab.url}>
          <TabFavicon tab={tab} size={20} />
        </Tooltip>
        
        {/* Clean Suburl / Domain */}
        <span style={{
          fontSize: "11px", fontWeight: 600,
          color: "var(--placeholder-color)", letterSpacing: "0.01em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          flex: 1
        }}>
          {tab.domain}
        </span>

        {tab.pinned && <span style={{ fontSize: "11px" }}>📌</span>}

        {/* 3-Dots More Options Menu */}
        <button
          onClick={e => { 
            e.stopPropagation(); 
            onMenu?.(tab);
          }}
          title={tr("common.moreOptions")}
          style={{
            width: "24px", height: "24px", borderRadius: "6px", border: "none",
            background: "transparent", color: "var(--text-color)",
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
            opacity: 1,
          }}
        >
          <EllipsisVerticalIcon style={{ width: "16px", height: "16px" }} />
        </button>
      </div>

      {/* Title Row with Curved Branch Arrow */}
      <Tooltip title={tab.title} url={tab.url}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
          
          {/* Branch Curve Arrow UI */}
          <svg 
            width="14" height="14" viewBox="0 0 24 24" 
            fill="none" stroke="var(--placeholder-color)" strokeWidth="2" 
            strokeLinecap="round" strokeLinejoin="round"
            style={{ marginTop: "2px", flexShrink: 0, opacity: 0.7 }}
          >
            <path d="M6 3v5a2 2 0 0 0 2 2h11"></path>
            <polyline points="15 6 19 10 15 14"></polyline>
          </svg>

          <span style={{
fontSize: "11px", fontWeight: 600, color: "var(--text-color)",
overflow: "hidden", textOverflow: "ellipsis",
display: "-webkit-box", WebkitLineClamp: 1,
WebkitBoxOrient: "vertical",
maxWidth: "80px",
          }}>
            {formatTabTitle(tab.title)}
          </span>
        </div>
      </Tooltip>

      {/* Tags */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "auto", flexWrap: "wrap" }}>
        {tab.tags?.slice(0, 3).map(tag => <TagPill key={tag} label={tag} />)}
        {tab.notes && (
          <Tooltip title={tr("common.note")} url={tab.notes}>
            <span style={{
              fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px",
              color: "#a78bfa", cursor: "default",
            }}>
              <DocumentTextIcon style={{ width: "12px", height: "12px" }} />
              {tr('common.note')}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
// ─── Main ───────────────────────────────────────────────────

export function TabList({
  searchQuery = "",
  viewMode = "list",
  onMenu,
  mode = "default",
  sortOrder = "desc",
  onDiscussAI,
}: {
  searchQuery?: string;
  viewMode?: ViewMode;
  onMenu?: (tab: SavedTab) => void;
  mode?: "default" | "notes";
  sortOrder?: "desc" | "asc";
  onDiscussAI?: (tab: SavedTab, groupTabs?: SavedTab[]) => void;
}) {

  const { t: tr, formatDate } = useI18n();
  const folders = useLiveQuery(() => db.folders.toArray());
  const tabs    = useLiveQuery(() => db.tabs.toArray());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  if (!folders || !tabs) return null;

  if (folders.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: "8px",
        color: "var(--placeholder-color)", fontSize: "13px",
      }}>
        <span style={{ fontSize: "32px" }}>📭</span>
        <span style={{ fontWeight: 500 }}>{tr("tabs.empty")}</span>
        <span style={{ fontSize: "11px", opacity: 0.6 }}>{tr("tabs.saveHint")}</span>
      </div>
    );
  }

  function toggleFolder(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getDateLabel(timestamp: number): string {
    const d = new Date(timestamp);
    if (isToday(d)) return tr("common.today");
    if (isYesterday(d)) return tr("common.yesterday");
    return formatDate(d);
  }

  const activeTabs = tabs.filter(t => !t.deletedAt);

  const sortedFolders = [...folders].sort((a, b) => {
    const aLatest = Math.max(0, ...activeTabs.filter(t => t.folderId === a.id).map(t => t.createdAt));
    const bLatest = Math.max(0, ...activeTabs.filter(t => t.folderId === b.id).map(t => t.createdAt));
    return sortOrder === "desc" ? bLatest - aLatest : aLatest - bLatest;
  });

  const foldersWithTabs = sortedFolders
    .map(folder => {
      const allFolderTabs = activeTabs.filter(t => t.folderId === folder.id);
      const folderTabs = (() => {
        let list = allFolderTabs;
        if (searchQuery.trim() !== "") {
          const fuse = new Fuse(allFolderTabs, {
            keys: ["title", "url", "notes", "tags"],
            threshold: 0.35,
            minMatchCharLength: 2,
          });
          list = fuse.search(searchQuery).map(r => r.item);
        }
        return [...list].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return sortOrder === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
        });
      })();

      if (folderTabs.length === 0) return null;

      const latestTime = Math.max(folder.createdAt || 0, ...folderTabs.map(t => t.createdAt));
      const dateLabel = getDateLabel(latestTime);

      return {
        folder,
        folderTabs,
        latestTime,
        dateLabel,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  if (foldersWithTabs.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: "8px",
        color: "var(--placeholder-color)", fontSize: "13px",
      }}>
        <span style={{ fontSize: "32px" }}>📭</span>
        <span style={{ fontWeight: 500 }}>{tr("tabs.empty")}</span>
        <span style={{ fontSize: "11px", opacity: 0.6 }}>{tr("tabs.saveHint")}</span>
      </div>
    );
  }

  // Group by dateLabel
  const dateGroups: { dateLabel: string; items: typeof foldersWithTabs }[] = [];
  for (const item of foldersWithTabs) {
    let group = dateGroups.find(g => g.dateLabel === item.dateLabel);
    if (!group) {
      group = { dateLabel: item.dateLabel, items: [] };
      dateGroups.push(group);
    }
    group.items.push(item);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {dateGroups.map((group, groupIdx) => (
        <div key={group.dateLabel} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Small Heading Outside The Card (media_1789174027024.png) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              background: "rgba(120, 120, 130, 0.10)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              fontSize: "11.5px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-color)",
              marginTop: groupIdx > 0 ? "14px" : "2px",
              marginBottom: "2px",
            }}
          >
            <CalendarIcon style={{ width: "15px", height: "15px", color: "var(--placeholder-color)" }} />
            {group.dateLabel}
          </div>

          {/* Cards under this date heading */}
          {group.items.map(({ folder, folderTabs }) => {
            const isCollapsed = collapsed.has(folder.id!);
            const tabWithNote = folderTabs.find(t => t.notes);

            return (
              <div key={folder.id} style={{
                borderRadius: "12px",
                border: "1px solid var(--folder-border)",
                overflow: "hidden",
                background: "var(--folder-bg)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}>
                {/* Folder Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "9px 12px",
                    boxSizing: "border-box",
                  }}
                >
                  <button
                    onClick={() => toggleFolder(folder.id!)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flex: 1,
                      minWidth: 0,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-color)",
                      padding: 0,
                      textAlign: "start",
                    }}
                  >
                    <img
                      src={getFaviconForDomain(folder.domain)}
                      width={20}
                      height={20}
                      style={{ borderRadius: "5px", flexShrink: 0 }}
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          `https://icons.duckduckgo.com/ip3/${folder.domain}.ico`;
                      }}
                    />

                    <span style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    }}>
                      {folder.name}
                    </span>
                  </button>

                  {/* Note badge or tab count pill */}
                  {tabWithNote ? (
                    <span
                      title={tabWithNote.notes}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        fontSize: "11px",
                        padding: "2px 7px",
                        borderRadius: "12px",
                        background: "rgba(167,139,250,0.15)",
                        border: "1px solid rgba(167,139,250,0.3)",
                        color: "#a78bfa",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      <DocumentTextIcon style={{ width: "12px", height: "12px" }} />
                      {tr('common.note')}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "rgba(120, 120, 130, 0.12)",
                        color: "var(--placeholder-color)",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {tr('common.count', { count: folderTabs.length })}
                    </span>
                  )}

                  {/* AI Sparkles button for folder/group of tabs */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiscussAI?.(folderTabs[0], folderTabs);
                    }}
                    title={tr("tabs.discuss")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      border: "none",
                      background: "transparent",
                      color: "#a855f7",
                      cursor: "pointer",
                      flexShrink: 0,
                      padding: 0,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <SparklesIcon style={{ width: "15px", height: "15px" }} />
                  </button>

                  {/* Collapse Chevron */}
                  <button
                    onClick={() => toggleFolder(folder.id!)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 4px",
                      color: "var(--placeholder-color)",
                      fontSize: "11px",
                      transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                      flexShrink: 0,
                    }}
                  >
                    ▾
                  </button>
                </div>

                {/* Tabs */}
                {!isCollapsed && (
                  viewMode === "list"
                    ? folderTabs.map(tab => (
                       <TabRowList
                         key={tab.id}
                         tab={tab}
                         onMenu={onMenu}
                         mode={mode}
                       />
                      ))
                    : (
                      <div className="tab-grid-scroll" style={{
                        display: "flex",
                        gap: "8px", padding: "8px 12px 12px",
                        borderTop: "1px solid rgba(90,90,95,0.15)",
                        overflowX: "auto", scrollSnapType: "x mandatory",
                      }}>
                        {folderTabs.map(tab => (
                          <div key={tab.id} style={{ minWidth: "140px", maxWidth: "140px", flexShrink: 0, scrollSnapAlign: "center" }}>
                            <TabCardGrid key={tab.id} tab={tab} onMenu={onMenu} />
                          </div>
                        ))}
                      </div>
                    )
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
