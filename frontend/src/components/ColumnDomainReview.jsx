/**
 * ColumnDomainReview.jsx
 * Modal de revisão de domínios especializado — v2 com 3 modos de seleção.
 *
 * Modos por card:
 *   • Automático  — aceita a sugestão do backend (padrão)
 *   • IA          — ativa AiDomainSuggestion para streaming
 *   • Catálogo    — abre DomainCatalog para busca manual
 *
 * Quando a IA não encontra domínio no sistema, SuggestDomainModal é aberto.
 */

import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, ChevronRight, CheckCircle2, AlertTriangle, Info,
  BookOpen, FlaskConical, Eye, Activity, Clock, Scale,
  ChevronDown, ChevronUp, Sparkles, Zap, List, Bot,
  Lightbulb
} from "lucide-react";

import AiDomainSuggestion from "./AiDomainSuggestion";
import DomainCatalog from "./DomainCatalog";
import SuggestDomainModal from "./SuggestDomainModal";

// ─── Design tokens (alinhados com a marca Paper Metrics) ────────────────────

const T = {
  bg:       "var(--surface, #111110)",
  bgDeep:   "var(--background, #0a0a09)",
  border:   "var(--border-subtle, #292524)",
  primary:  "var(--color-primary, #5eead4)",
  accent:   "var(--color-accent, #134e4a)",
  text:     "var(--text-main, #e7e5e4)",
  muted:    "var(--text-muted, #a8a29e)",
  dim:      "#78716c",
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high:    { color: "#5eead4", label: "Alta confiança",   bg: "rgba(94,234,212,0.08)" },
  medium:  { color: "#fbbf24", label: "Confiança média",  bg: "rgba(251,191,36,0.08)" },
  low:     { color: "#f87171", label: "Baixa confiança",  bg: "rgba(248,113,113,0.08)" },
  unknown: { color: "#78716c", label: "Desconhecido",     bg: "rgba(120,113,108,0.08)" },
};

const SOURCE_LABELS = {
  dictionary:     "Dicionário clínico",
  ai_library:     "IA + Literatura",
  ai_generic:     "IA (sem biblioteca)",
  manual_catalog: "Catálogo manual",
  ai_suggestion:  "Sugestão da IA",
  unknown:        "Desconhecido",
};

const DOMAIN_ICONS = {
  visual_acuity_snellen: Eye,
  intraocular_pressure:  Activity,
  pain_scale_vas_nrs:    Activity,
  likert_scale_5:        Scale,
  likert_scale_7:        Scale,
  bmi_calculable:        Scale,
  bmi_direct:            Scale,
  mixed_time_units:      Clock,
  _default:              FlaskConical,
};

function DomainIcon({ domain, size = 18 }) {
  const Icon = DOMAIN_ICONS[domain] || DOMAIN_ICONS._default;
  return <Icon size={size} />;
}

// ─── Seletor de modo (tabs "Automático / IA / Catálogo") ──────────────────────

const MODES = [
  { key: "auto",    label: "Ver Sugestão", Icon: Zap,  title: "Ver o que o sistema detectou automaticamente" },
  { key: "ai",      label: "Sugerir com IA", Icon: Bot, title: "Ativar IA para sugerir a categoria correta" },
  { key: "catalog", label: "Catálogo",       Icon: List, title: "Selecionar manualmente do catálogo" },
];

function ModeSelector({ activeMode, onSelect }) {
  return (
    <div style={{
      display: "flex", gap: 4, marginTop: 14, marginBottom: 2,
      padding: "4px", background: T.bgDeep, borderRadius: 10,
      border: `1px solid ${T.border}`,
    }}>
      {MODES.map(({ key, label, Icon, title }) => {
        const isActive = activeMode === key;
        return (
          <motion.button
            key={key}
            onClick={() => onSelect(key)}
            title={title}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              flex: 1, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 5,
              padding: "7px 10px", borderRadius: 7,
              background: isActive ? "rgba(94,234,212,0.1)" : "transparent",
              border: isActive ? "1px solid rgba(94,234,212,0.25)" : "1px solid transparent",
              color: isActive ? T.primary : T.dim,
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              cursor: "pointer", transition: "all 0.18s",
            }}
            aria-pressed={isActive}
          >
            <Icon size={12} />
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Pill de domínio aplicado ─────────────────────────────────────────────────

function AppliedDomainPill({ domain, onClear }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "5px 10px 5px 12px", borderRadius: 20, marginTop: 8,
        background: "rgba(94,234,212,0.08)", border: "1px solid rgba(94,234,212,0.25)",
        fontSize: 12, color: T.primary, fontWeight: 500,
      }}
    >
      <CheckCircle2 size={13} style={{ color: T.primary }} />
      {domain.display_name}
      <button
        onClick={onClear}
        style={{
          background: "none", border: "none", color: T.primary,
          cursor: "pointer", padding: "0 2px", lineHeight: 1,
          opacity: 0.7, transition: "opacity 0.15s",
        }}
        title="Remover seleção"
        aria-label="Remover domínio selecionado"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

// ─── Card de resolução individual ─────────────────────────────────────────────

function ColumnResolutionCard({ resolution, index, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(null);
  const [appliedDomain, setAppliedDomain] = useState(null);
  const [suggestTarget, setSuggestTarget] = useState(null);

  const conf = CONFIDENCE_CONFIG[resolution.confidence] || CONFIDENCE_CONFIG.unknown;
  const options = appliedDomain?.transformations || [];
  const selectedTransformation = resolution.userChoice ?? "none";

  const handleTransformationChange = useCallback((val) => {
    onChange(resolution.column, { userChoice: val });
  }, [resolution.column, onChange]);

  const handleDomainApply = useCallback((domainData) => {
    setAppliedDomain(domainData);
    setMode(null);
    onChange(resolution.column, {
      userChoice: domainData.transformation || "none",
      domainOverride: domainData,
    });
  }, [resolution.column, onChange]);

  const handleConfirmAuto = useCallback(() => {
    const autoData = {
      domain: resolution.domain,
      display_name: resolution.display_name || resolution.domain?.replace(/_/g, " ") || "Desconhecido",
      transformation: resolution.suggested_transformation || "none",
      transformations: resolution.transformation_options || [],
      rationale: resolution.rationale,
      confidence: resolution.confidence,
      source: resolution.source || "dictionary",
    };
    setAppliedDomain(autoData);
    setMode(null);
    onChange(resolution.column, {
      userChoice: autoData.transformation,
      domainOverride: autoData,
    });
  }, [resolution, onChange]);

  const handleClearApplied = useCallback(() => {
    setAppliedDomain(null);
    setMode(null);
    onChange(resolution.column, { userChoice: undefined, domainOverride: null });
  }, [resolution.column, onChange]);

  const handleModeSelect = useCallback((newMode) => {
    setMode(prev => (prev === newMode ? null : newMode));
  }, []);

  const handleAiNotFound = useCallback((aiResult) => {
    setSuggestTarget(aiResult);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      style={{
        background: T.bg,
        border: `1px solid ${appliedDomain ? "rgba(94,234,212,0.2)" : T.border}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
        transition: "border-color 0.3s",
      }}
    >
      {/* Header do card */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={`Expandir detalhes da coluna ${resolution.column}`}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: appliedDomain ? "rgba(94,234,212,0.08)" : conf.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: appliedDomain ? T.primary : conf.color, flexShrink: 0,
          transition: "all 0.3s",
        }}>
          {appliedDomain
            ? <CheckCircle2 size={18} />
            : <DomainIcon domain={resolution.domain} size={18} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 14, color: T.text }}>
              {resolution.column}
            </span>
            {resolution.sample_values?.length > 0 && (
              <span style={{
                fontSize: 10, padding: "2px 7px",
                borderRadius: 20, background: "rgba(255,255,255,0.03)",
                color: T.dim, border: `1px solid ${T.border}`,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                {resolution.sample_values.slice(0, 2).join(", ")}{resolution.sample_values.length > 2 ? "…" : ""}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            {appliedDomain ? (
              <AppliedDomainPill domain={appliedDomain} onClear={handleClearApplied} />
            ) : (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 6,
                background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`,
                color: T.dim, fontSize: 12,
              }}>
                <Info size={12} />
                Categoria nao definida — expanda para classificar
              </div>
            )}
          </div>
        </div>

        <div style={{ color: T.dim, flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Corpo expandido */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden", borderTop: `1px solid ${T.border}` }}
          >
            <div style={{ padding: "16px 16px 20px" }}>

              {/* Domínio aplicado + opções de transformação */}
              {appliedDomain && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 12px", borderRadius: 8, marginBottom: 12,
                    background: "rgba(94,234,212,0.05)", border: "1px solid rgba(94,234,212,0.15)",
                  }}>
                    <CheckCircle2 size={15} style={{ color: T.primary, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.primary }}>
                        {appliedDomain.display_name}
                      </div>
                      {appliedDomain.rationale && (
                        <div style={{ fontSize: 11, color: T.dim, marginTop: 2, lineHeight: 1.4 }}>
                          {appliedDomain.rationale}
                        </div>
                      )}
                    </div>
                  </div>

                  {options.length > 0 && (
                    <div>
                      <div style={{
                        fontSize: 11, color: T.dim, fontWeight: 600,
                        marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        Transformação
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {options.map((opt) => {
                          const isSelected = (selectedTransformation) === opt.key;
                          return (
                            <label
                              key={opt.key}
                              style={{
                                display: "flex", alignItems: "flex-start", gap: 10,
                                padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                                background: isSelected ? "rgba(94,234,212,0.08)" : T.bgDeep,
                                border: `1px solid ${isSelected ? "rgba(94,234,212,0.3)" : T.border}`,
                                transition: "all 0.15s",
                              }}
                            >
                              <input
                                type="radio"
                                name={`tf_${resolution.column}`}
                                value={opt.key}
                                checked={isSelected}
                                onChange={() => handleTransformationChange(opt.key)}
                                style={{ marginTop: 2, accentColor: "#5eead4" }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? T.primary : T.text }}>
                                  {opt.label}
                                </div>
                                {opt.warning && (
                                  <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 3 }}>⚠ {opt.warning}</div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Amostras */}
              {resolution.sample_values?.length > 0 && !appliedDomain && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 10, color: T.dim, fontWeight: 700,
                    marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Valores de amostra
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {resolution.sample_values.map((v, i) => (
                      <span key={i} style={{
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                        padding: "3px 8px", borderRadius: 5,
                        background: T.bgDeep, color: T.muted, border: `1px solid ${T.border}`,
                      }}>{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Seletor de modo */}
              {!appliedDomain && (
                <ModeSelector activeMode={mode} onSelect={handleModeSelect} />
              )}

              {/* Painéis de modo */}
              <AnimatePresence mode="wait">
                {mode === "auto" && !appliedDomain && (
                  <motion.div
                    key="auto-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: "hidden" }}
                  >
                    {resolution.domain ? (
                      <div style={{
                        marginTop: 12,
                        background: "rgba(94,234,212,0.05)",
                        border: "1px solid rgba(94,234,212,0.15)",
                        borderRadius: 10, padding: "14px 16px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <DomainIcon domain={resolution.domain} size={16} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.primary }}>
                              {resolution.display_name || resolution.domain?.replace(/_/g, " ")}
                            </div>
                            <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                              Detectado automaticamente · {CONFIDENCE_CONFIG[resolution.confidence]?.label || "Confiança desconhecida"}
                            </div>
                          </div>
                        </div>
                        {resolution.rationale && (
                          <div style={{
                            fontSize: 11, color: T.muted, lineHeight: 1.5,
                            marginBottom: 12, paddingLeft: 4,
                          }}>
                            {resolution.rationale}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <motion.button
                            onClick={handleConfirmAuto}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                              flex: 1, display: "flex", alignItems: "center", gap: 6,
                              justifyContent: "center", padding: "8px 14px",
                              borderRadius: 8, background: T.primary,
                              border: "none", color: T.accent, fontSize: 12, fontWeight: 600,
                              cursor: "pointer", boxShadow: "0 3px 10px rgba(94,234,212,0.15)",
                            }}
                          >
                            <CheckCircle2 size={13} />
                            Confirmar esta categoria
                          </motion.button>
                          <button
                            onClick={() => setMode(null)}
                            style={{
                              padding: "8px 14px", borderRadius: 8,
                              background: "transparent", border: `1px solid ${T.border}`,
                              color: T.dim, fontSize: 12, cursor: "pointer",
                            }}
                          >
                            Ignorar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        marginTop: 12, padding: "12px 14px",
                        background: "rgba(255,255,255,0.02)", borderRadius: 9,
                        border: `1px solid ${T.border}`,
                        fontSize: 12, color: T.dim, textAlign: "center",
                      }}>
                        Nenhuma sugestao automatica disponivel para esta coluna.
                        <br />
                        <span style={{ fontSize: 11, color: T.dim, opacity: 0.7 }}>Use Sugerir com IA ou o Catalogo.</span>
                      </div>
                    )}
                  </motion.div>
                )}

                {mode === "ai" && !appliedDomain && (
                  <motion.div
                    key="ai-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: "hidden" }}
                  >
                    <AiDomainSuggestion
                      resolution={resolution}
                      onApply={handleDomainApply}
                      onNotFound={handleAiNotFound}
                    />
                  </motion.div>
                )}

                {mode === "catalog" && !appliedDomain && (
                  <motion.div
                    key="catalog-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: "hidden" }}
                  >
                    <DomainCatalog
                      resolution={resolution}
                      onApply={handleDomainApply}
                      onClose={() => setMode("auto")}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {suggestTarget && (
        <SuggestDomainModal
          resolution={resolution}
          aiResult={suggestTarget}
          onClose={() => setSuggestTarget(null)}
          onSent={() => setSuggestTarget(null)}
        />
      )}
    </motion.div>
  );
}

// ─── Card de aviso bilateral (OD/OE) ─────────────────────────────────────────

function BilateralWarningCard({ warning, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{
        background: "rgba(94,234,212,0.04)",
        border: "1px solid rgba(94,234,212,0.15)",
        borderRadius: 10, marginBottom: 10, overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", cursor: "pointer", userSelect: "none",
        }}
      >
        <Eye size={16} style={{ color: T.primary, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.primary }}>
            Par bilateral detectado:{" "}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{warning.right_column}</span>
            {" + "}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{warning.left_column}</span>
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
            {warning.display_name} — regra clinica disponivel
          </div>
        </div>
        {expanded
          ? <ChevronUp size={14} style={{ color: T.dim }} />
          : <ChevronDown size={14} style={{ color: T.dim }} />
        }
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", borderTop: "1px solid rgba(94,234,212,0.1)" }}
          >
            <div style={{ padding: "12px 14px 14px" }}>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 8 }}>
                {warning.clinical_rule}
              </div>
              {warning.derived_column_suggestion && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "7px 10px", borderRadius: 6,
                  background: "rgba(94,234,212,0.05)", border: "1px solid rgba(94,234,212,0.12)",
                  fontSize: 12, color: T.primary,
                }}>
                  <Lightbulb size={13} />
                  Coluna derivada sugerida:{" "}
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", marginLeft: 4 }}>
                    {warning.derived_column_suggestion}
                  </span>
                </div>
              )}
              {warning.reference && (
                <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>
                  📚 {warning.reference}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ColumnDomainReview({
  isOpen,
  resolutions = [],
  bilateralWarnings = [],
  derivedCandidates = [],
  onConfirm,
  onSkip,
}) {
  const [choices, setChoices] = useState({});
  const [confirming, setConfirming] = useState(false);

  const handleChange = useCallback((columnName, update) => {
    setChoices(prev => ({
      ...prev,
      [columnName]: { ...(prev[columnName] || {}), ...update },
    }));
  }, []);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    const finalChoices = resolutions.map(r => {
      const ch = choices[r.column] || {};
      return {
        column: r.column,
        domain: ch.domainOverride?.domain || r.domain,
        display_name: ch.domainOverride?.display_name || r.display_name,
        transformation: ch.userChoice ?? r.suggested_transformation ?? "none",
        source: ch.domainOverride?.source || r.source,
      };
    });
    await onConfirm(finalChoices, derivedCandidates);
    setConfirming(false);
  }, [resolutions, choices, derivedCandidates, onConfirm]);

  const needsAttention = resolutions.length > 0 || bilateralWarnings.length > 0 || derivedCandidates.length > 0;
  if (!isOpen || !needsAttention) return null;

  const detectedResolutions = resolutions.filter(r => r.needs_attention || r.domain);
  const totalColumns = detectedResolutions.length;
  const confirmedCount = detectedResolutions.filter(r => {
    const ch = choices[r.column];
    return ch?.domainOverride || (ch?.userChoice ?? r.suggested_transformation) !== "none";
  }).length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, zIndex: 800,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "0 16px",
          overflowY: "auto",
        }}
      >
        <motion.div
          key="panel"
          initial={{ scale: 0.96, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={{
            background: T.bg,
            borderRadius: 16,
            boxShadow: `0 25px 60px rgba(0,0,0,0.5), 0 0 0 0.5px ${T.border}`,
            width: "100%",
            maxWidth: 720,
            maxHeight: "calc(100vh - 48px)",
            margin: "24px 0",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {/* Header */}
          <div style={{
            padding: "22px 24px 16px",
            borderBottom: `0.5px solid ${T.border}`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: "rgba(94,234,212,0.08)", border: "1px solid rgba(94,234,212,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Sparkles size={20} style={{ color: T.primary }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'Inter', sans-serif" }}>
                  Revisao de Variaveis
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                  {resolutions.length} variave{resolutions.length > 1 ? "is" : "l"} encontrada{resolutions.length > 1 ? "s" : ""}
                  {totalColumns > 0 ? ` (${totalColumns} com categoria detectada)` : ""}.
                  {" "}Classifique ou refine com IA / catalogo.
                </p>

                <div style={{
                  display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap",
                }}>
                  {MODES.map(({ key, label, Icon }) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.dim }}>
                      <Icon size={11} />
                      <strong style={{ color: T.muted }}>{label}</strong>
                      {key === "auto" && " — aceita sugestao automatica"}
                      {key === "ai" && " — ativa IA com streaming"}
                      {key === "catalog" && " — busca manual no catalogo"}
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={onSkip}
                title="Pular revisão"
                style={{
                  background: "none", border: "none", color: T.dim,
                  cursor: "pointer", padding: 4, borderRadius: 6,
                }}
                aria-label="Fechar revisão"
              >
                <X size={20} />
              </button>
            </div>

            {/* Barra de progresso */}
            {totalColumns > 0 && (
              <div style={{
                marginTop: 16, height: 3, borderRadius: 2,
                background: T.border, overflow: "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(confirmedCount / totalColumns) * 100}%` }}
                  style={{ height: "100%", background: T.primary, borderRadius: 2 }}
                />
              </div>
            )}
          </div>

          {/* Corpo com scroll */}
          <div style={{ overflowY: "auto", flex: 1, padding: "18px 24px" }}>

            {/* Pares bilaterais */}
            {bilateralWarnings.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
                  color: T.primary, fontSize: 12, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  <Eye size={13} />
                  Regras Bilaterais (OD/OE)
                </div>
                {bilateralWarnings.map((w, i) => (
                  <BilateralWarningCard key={`${w.right_column}_${w.left_column}`} warning={w} index={i} />
                ))}
              </div>
            )}

            {/* Cards de coluna */}
            {(() => {
              const detected = resolutions.filter(r => r.needs_attention || r.domain);
              const others = resolutions.filter(r => !r.needs_attention && !r.domain);
              return (
                <>
                  {detected.length > 0 && (
                    <div style={{ marginBottom: others.length > 0 ? 20 : 0 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
                        color: T.primary, fontSize: 12, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        <FlaskConical size={13} />
                        Categorias Detectadas ({detected.length})
                      </div>
                      {detected.map((res, i) => (
                        <ColumnResolutionCard
                          key={res.column}
                          resolution={{ ...res, ...choices[res.column] }}
                          index={i}
                          onChange={handleChange}
                        />
                      ))}
                    </div>
                  )}

                  {others.length > 0 && (
                    <div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
                        color: T.muted, fontSize: 12, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        <List size={13} />
                        Demais Variaveis ({others.length})
                      </div>
                      <p style={{ fontSize: 12, color: T.dim, marginBottom: 12, marginTop: 0 }}>
                        Expanda para classificar com IA ou catalogo, se necessario.
                      </p>
                      {others.map((res, i) => (
                        <ColumnResolutionCard
                          key={res.column}
                          resolution={{ ...res, ...choices[res.column] }}
                          index={detected.length + i}
                          onChange={handleChange}
                        />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Variáveis Derivadas Automáticas */}
            {derivedCandidates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
                  color: T.primary, fontSize: 12, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  <Sparkles size={13} />
                  Variaveis Derivadas (criadas automaticamente)
                </div>
                <div style={{
                  background: "rgba(94,234,212,0.03)",
                  border: "1px solid rgba(94,234,212,0.12)",
                  borderRadius: 10, padding: "12px 16px",
                }}>
                  <div style={{ color: T.primary, fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
                    As seguintes variaveis serao criadas automaticamente e ficarao disponiveis como desfecho:
                  </div>
                  {derivedCandidates.map((c, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 7, marginBottom: 6,
                      background: "rgba(94,234,212,0.04)",
                      border: "1px solid rgba(94,234,212,0.08)",
                    }}>
                      <CheckCircle2 size={14} style={{ color: T.primary, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.primary, fontWeight: 600, fontSize: 13 }}>
                          {c.derived_name}
                        </span>
                        {c.formula && (
                          <span style={{ color: T.muted, marginLeft: 8, fontSize: 11 }}>
                            ({c.formula})
                          </span>
                        )}
                        {c.sources && (
                          <span style={{ color: T.dim, marginLeft: 6, fontSize: 11 }}>
                            ← {Array.isArray(c.sources) ? c.sources.join(" + ") : c.sources}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 20,
                        background: "rgba(94,234,212,0.08)", color: T.primary,
                        border: "1px solid rgba(94,234,212,0.15)", whiteSpace: "nowrap",
                      }}>
                        {c.type === "best_eye" ? "Melhor olho" :
                         c.type === "snellen_to_logmar" ? "LogMAR" :
                         c.type === "imc" ? "IMC" :
                         c.type || "derivada"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nota de rodapé */}
            <div style={{
              display: "flex", gap: 8, padding: "10px 12px",
              background: "rgba(255,255,255,0.02)", borderRadius: 8,
              border: `1px solid ${T.border}`, marginTop: 4,
              fontSize: 11, color: T.dim, lineHeight: 1.6,
            }}>
              <Info size={13} style={{ color: T.dim, marginTop: 1, flexShrink: 0 }} />
              <span>
                Use o modo <strong style={{ color: T.primary }}>Automatico</strong> para
                aceitar a deteccao, <strong style={{ color: T.primary }}>Sugerir IA</strong> para
                uma analise aprofundada, ou <strong style={{ color: T.primary }}>Catalogo</strong> para
                busca manual. Se uma categoria ainda nao existe, envie uma sugestao ao desenvolvedor.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 24px",
            borderTop: `0.5px solid ${T.border}`,
            background: T.bg,
            flexShrink: 0,
          }}>
            <button
              onClick={onSkip}
              style={{
                padding: "9px 18px", borderRadius: 8,
                background: "transparent", border: `1px solid ${T.border}`,
                color: T.muted, fontSize: 13, cursor: "pointer",
              }}
            >
              Pular (usar padroes)
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {totalColumns > 0 && (
                <span style={{ fontSize: 12, color: T.dim }}>
                  {confirmedCount}/{totalColumns} revisada{confirmedCount !== 1 ? "s" : ""}
                </span>
              )}
              <motion.button
                onClick={handleConfirm}
                disabled={confirming}
                whileHover={!confirming ? { scale: 1.02 } : {}}
                whileTap={!confirming ? { scale: 0.97 } : {}}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 22px", borderRadius: 8,
                  background: confirming ? T.border : T.primary,
                  border: "none", color: confirming ? T.muted : T.accent, fontSize: 13, fontWeight: 600,
                  cursor: confirming ? "not-allowed" : "pointer",
                  boxShadow: confirming ? "none" : "0 4px 16px rgba(94,234,212,0.15)",
                  transition: "all 0.2s",
                }}
                id="domain-review-confirm-btn"
              >
                {confirming ? "Aplicando…" : "Confirmar e Continuar"}
                {!confirming && <ChevronRight size={15} />}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
