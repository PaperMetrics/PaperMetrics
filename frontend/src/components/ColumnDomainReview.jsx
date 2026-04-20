/**
 * ColumnDomainReview.jsx
 * Modal de revisão de domínios especializados detectados nas colunas do CSV.
 *
 * Aparece após get-columns e antes de OutcomeSelector quando domínios são detectados.
 * O usuário revisa, confirma transformações, e o sistema aprende com suas decisões.
 */

import React, { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, ChevronRight, CheckCircle2, AlertTriangle, Info,
  BookOpen, FlaskConical, Eye, Activity, Clock, Scale,
  ChevronDown, ChevronUp, Lightbulb, Sparkles, GraduationCap
} from "lucide-react";

// ─── Utilitários ─────────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high:    { color: "#10b981", label: "Alta confiança",   bg: "rgba(16,185,129,0.1)" },
  medium:  { color: "#f59e0b", label: "Confiança média",  bg: "rgba(245,158,11,0.1)" },
  low:     { color: "#ef4444", label: "Baixa confiança",  bg: "rgba(239,68,68,0.1)"  },
  unknown: { color: "#64748b", label: "Desconhecido",     bg: "rgba(100,116,139,0.1)"},
};

const SOURCE_LABELS = {
  dictionary: "Dicionário clínico",
  ai_library: "IA + Literatura",
  ai_generic: "IA (sem biblioteca)",
  unknown:    "Desconhecido",
};

const DOMAIN_ICONS = {
  visual_acuity_snellen:  Eye,
  intraocular_pressure:   Activity,
  pain_scale_vas_nrs:     Activity,
  likert_scale_5:         Scale,
  likert_scale_7:         Scale,
  bmi_calculable:         Scale,
  bmi_direct:             Scale,
  mixed_time_units:       Clock,
  _default:               FlaskConical,
};

function DomainIcon({ domain, size = 18 }) {
  const Icon = DOMAIN_ICONS[domain] || DOMAIN_ICONS._default;
  return <Icon size={size} />;
}

// ─── Card de resolução individual ────────────────────────────────────────────

function ColumnResolutionCard({ resolution, index, onChange, onTeach }) {
  const [expanded, setExpanded] = useState(false);
  const conf = CONFIDENCE_CONFIG[resolution.confidence] || CONFIDENCE_CONFIG.unknown;
  const selectedTransformation = resolution.userChoice ?? resolution.suggested_transformation ?? "none";

  const handleTransformationChange = useCallback((val) => {
    onChange(resolution.column, { userChoice: val, teachMode: false });
  }, [resolution.column, onChange]);

  const handleTeachClick = useCallback(() => {
    onTeach(resolution);
  }, [resolution, onTeach]);

  const options = resolution.transformation_options || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      {/* Header do card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={`Expandir detalhes da coluna ${resolution.column}`}
      >
        {/* Ícone de domínio */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: conf.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: conf.color, flexShrink: 0,
        }}>
          <DomainIcon domain={resolution.domain} size={18} />
        </div>

        {/* Nome da coluna + domínio */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 14, color: "#f1f5f9" }}>
              {resolution.column}
            </span>
            {/* Badge de confiança */}
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px",
              borderRadius: 20, background: conf.bg, color: conf.color,
              textTransform: "uppercase", letterSpacing: "0.04em",
              border: `1px solid ${conf.color}30`,
            }}>
              {conf.label}
            </span>
            {/* Badge de fonte */}
            <span style={{
              fontSize: 10, padding: "2px 7px",
              borderRadius: 20, background: "rgba(100,116,139,0.12)",
              color: "#94a3b8", border: "1px solid #1f2937",
            }}>
              {SOURCE_LABELS[resolution.source] || resolution.source}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {resolution.domain
              ? `Domínio: ${resolution.domain.replace(/_/g, " ")}`
              : resolution.rationale?.slice(0, 80) + "…"
            }
          </div>
        </div>

        {/* Transformação selecionada */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 6,
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
          color: "#818cf8", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
        }}>
          <CheckCircle2 size={13} />
          {options.find(o => o.key === selectedTransformation)?.label?.split(" (")[0] || selectedTransformation}
        </div>

        {/* Toggle expand */}
        <div style={{ color: "#475569", flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Aviso inline (warning) */}
      {resolution.warning && !expanded && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "8px 16px 10px",
          background: "rgba(245,158,11,0.07)",
          borderTop: "1px solid rgba(245,158,11,0.12)",
          fontSize: 12, color: "#fbbf24",
        }}>
          <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{resolution.warning}</span>
        </div>
      )}

      {/* Corpo expandido */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden", borderTop: "1px solid #1a2234" }}
          >
            <div style={{ padding: "16px 16px 20px" }}>

              {/* Amostras */}
              {resolution.sample_values?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Amostras detectadas
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {resolution.sample_values.map((v, i) => (
                      <span key={i} style={{
                        fontFamily: "monospace", fontSize: 12,
                        padding: "3px 8px", borderRadius: 5,
                        background: "#1a2234", color: "#94a3b8",
                        border: "1px solid #253354",
                      }}>{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rationale */}
              {resolution.rationale && (
                <div style={{
                  display: "flex", gap: 10, padding: "10px 12px",
                  background: "rgba(99,102,241,0.07)", borderRadius: 8,
                  border: "1px solid rgba(99,102,241,0.15)", marginBottom: 14,
                }}>
                  <BookOpen size={14} style={{ color: "#818cf8", marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: "#a5b4fc", lineHeight: 1.5 }}>{resolution.rationale}</div>
                    {resolution.reference && (
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                        📚 {resolution.reference}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Aviso */}
              {resolution.warning && (
                <div style={{
                  display: "flex", gap: 8, padding: "9px 12px",
                  background: "rgba(245,158,11,0.07)", borderRadius: 8,
                  border: "1px solid rgba(245,158,11,0.15)", marginBottom: 14,
                  fontSize: 12, color: "#fbbf24",
                }}>
                  <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{resolution.warning}</span>
                </div>
              )}

              {/* Seleção de transformação */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Escolher transformação
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {options.map((opt) => {
                    const isSelected = selectedTransformation === opt.key;
                    return (
                      <label
                        key={opt.key}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 10,
                          padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                          background: isSelected ? "rgba(99,102,241,0.12)" : "#0f172a",
                          border: `1px solid ${isSelected ? "rgba(99,102,241,0.4)" : "#1f2937"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        <input
                          type="radio"
                          name={`tf_${resolution.column}`}
                          value={opt.key}
                          checked={isSelected}
                          onChange={() => handleTransformationChange(opt.key)}
                          style={{ marginTop: 2, accentColor: "#6366f1" }}
                          aria-label={opt.label}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 500,
                            color: isSelected ? "#a5b4fc" : "#cbd5e1",
                          }}>
                            {opt.label}
                          </div>
                          {opt.warning && (
                            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 3 }}>
                              ⚠ {opt.warning}
                            </div>
                          )}
                          {opt.suitable_for && isSelected && (
                            <div style={{ fontSize: 11, color: "#10b981", marginTop: 3 }}>
                              ✓ Adequado para: {opt.suitable_for.slice(0, 3).join(", ")}
                              {opt.suitable_for.length > 3 && "…"}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Botão ensinar (domínio não reconhecido) */}
              {!resolution.domain && (
                <button
                  onClick={handleTeachClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    marginTop: 14, padding: "8px 14px", borderRadius: 7,
                    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
                    color: "#fbbf24", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  <GraduationCap size={14} />
                  Ensinar sistema — definir este domínio manualmente
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        background: "rgba(16,185,129,0.06)",
        border: "1px solid rgba(16,185,129,0.2)",
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
        <Eye size={16} style={{ color: "#10b981", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#6ee7b7" }}>
            Par bilateral detectado: <span style={{ fontFamily: "monospace" }}>{warning.right_column}</span> + <span style={{ fontFamily: "monospace" }}>{warning.left_column}</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            {warning.display_name} — regra clínica disponível
          </div>
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: "#475569" }} /> : <ChevronDown size={14} style={{ color: "#475569" }} />}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", borderTop: "1px solid rgba(16,185,129,0.12)" }}
          >
            <div style={{ padding: "12px 14px 14px" }}>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8 }}>
                {warning.clinical_rule}
              </div>
              {warning.derived_column_suggestion && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "7px 10px", borderRadius: 6,
                  background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)",
                  fontSize: 12, color: "#34d399",
                }}>
                  <Lightbulb size={13} />
                  Coluna derivada sugerida: <span style={{ fontFamily: "monospace", marginLeft: 4 }}>{warning.derived_column_suggestion}</span>
                </div>
              )}
              {warning.reference && (
                <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
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

// ─── Modal de ensino (quando usuário quer ensinar domínio custom) ─────────────

function TeachDomainModal({ resolution, onClose, onSave }) {
  const [description, setDescription] = useState("");
  const [transformation, setTransformation] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!description.trim() || !transformation.trim()) return;
    setSaving(true);
    await onSave({
      column_name: resolution.column,
      sample_values: resolution.sample_values || [],
      domain_description: description,
      transformation,
      user_note: note,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{
          background: "#0f172a", borderRadius: 14, padding: 28,
          width: "100%", maxWidth: 480,
          border: "1px solid rgba(245,158,11,0.25)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <GraduationCap size={20} style={{ color: "#fbbf24" }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>
            Ensinar Domínio
          </h3>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#475569", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>
            Coluna: <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{resolution.column}</span>
          </label>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>
            O que essa coluna representa? *
          </label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex: Escala de Ansiedade de Hamilton (HAM-A)"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 7,
              background: "#1a2234", border: "1px solid #253354",
              color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>
            Como tratar esses dados? *
          </label>
          <input
            value={transformation}
            onChange={e => setTransformation(e.target.value)}
            placeholder="Ex: ordinal (não-paramétrico), contínuo, categórico…"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 7,
              background: "#1a2234", border: "1px solid #253354",
              color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>
            Nota adicional (opcional)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Referência, contexto, regra especial…"
            rows={2}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 7,
              background: "#1a2234", border: "1px solid #253354",
              color: "#f1f5f9", fontSize: 13, outline: "none",
              resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 7,
            background: "#1a2234", border: "1px solid #253354",
            color: "#64748b", fontSize: 13, cursor: "pointer",
          }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!description.trim() || !transformation.trim() || saving}
            style={{
              padding: "9px 18px", borderRadius: 7,
              background: description.trim() && transformation.trim() ? "#d97706" : "#4a3b19",
              border: "none", color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: description.trim() && transformation.trim() ? "pointer" : "not-allowed",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Salvando…" : "Salvar e Aprender"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ColumnDomainReview({
  isOpen,
  resolutions = [],
  bilateralWarnings = [],
  onConfirm,
  onSkip,
  onTeachDomain,
}) {
  const [choices, setChoices] = useState({});
  const [teachTarget, setTeachTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const handleChange = useCallback((columnName, update) => {
    setChoices(prev => ({
      ...prev,
      [columnName]: { ...(prev[columnName] || {}), ...update },
    }));
  }, []);

  const handleTeach = useCallback((resolution) => {
    setTeachTarget(resolution);
  }, []);

  const handleTeachSave = useCallback(async (payload) => {
    if (onTeachDomain) await onTeachDomain(payload);
  }, [onTeachDomain]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    // Mesclar choices com sugestões padrão para colunas não alteradas
    const finalChoices = resolutions.map(r => ({
      column: r.column,
      domain: r.domain,
      transformation: choices[r.column]?.userChoice ?? r.suggested_transformation ?? "none",
    }));
    await onConfirm(finalChoices);
    setConfirming(false);
  }, [resolutions, choices, onConfirm]);

  const needsAttention = resolutions.length > 0 || bilateralWarnings.length > 0;

  if (!isOpen || !needsAttention) return null;

  const totalColumns = resolutions.length;
  const confirmedCount = resolutions.filter(r =>
    (choices[r.column]?.userChoice ?? r.suggested_transformation) !== "none"
    || r.domain === null
  ).length;

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, zIndex: 800,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px 16px",
        }}
      >
        <motion.div
          key="panel"
          initial={{ scale: 0.96, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={{
            background: "#0b1221",
            borderRadius: 16,
            boxShadow: "0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.15)",
            width: "100%",
            maxWidth: 700,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "22px 24px 16px",
            borderBottom: "1px solid #1a2234",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Sparkles size={20} style={{ color: "#818cf8" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>
                  Revisão de Domínios Especializados
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                  {totalColumns > 0
                    ? `${totalColumns} coluna${totalColumns > 1 ? "s" : ""} com domínio especializado detectado${totalColumns > 1 ? "s" : ""}. Confirme as transformações antes de prosseguir.`
                    : "Revise os avisos clínicos antes de prosseguir."
                  }
                </p>
              </div>
              <button
                onClick={onSkip}
                title="Pular revisão"
                style={{
                  background: "none", border: "none", color: "#475569",
                  cursor: "pointer", padding: 4, borderRadius: 6,
                  transition: "color 0.15s",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Barra de progresso suave */}
            {totalColumns > 0 && (
              <div style={{
                marginTop: 16, height: 3, borderRadius: 2,
                background: "#1a2234", overflow: "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(confirmedCount / totalColumns) * 100}%` }}
                  style={{ height: "100%", background: "#6366f1", borderRadius: 2 }}
                />
              </div>
            )}
          </div>

          {/* Corpo com scroll */}
          <div style={{ overflowY: "auto", flex: 1, padding: "18px 24px" }}>

            {/* Seção de pares bilaterais */}
            {bilateralWarnings.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 7,
                  marginBottom: 10, color: "#10b981",
                  fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  <Eye size={13} />
                  Regras Bilaterais (OD/OE)
                </div>
                {bilateralWarnings.map((w, i) => (
                  <BilateralWarningCard key={`${w.right_column}_${w.left_column}`} warning={w} index={i} />
                ))}
              </div>
            )}

            {/* Seção de colunas com domínio */}
            {resolutions.length > 0 && (
              <div>
                {bilateralWarnings.length > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 7,
                    marginBottom: 10, color: "#818cf8",
                    fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    <FlaskConical size={13} />
                    Domínios por Coluna
                  </div>
                )}
                {resolutions.map((res, i) => (
                  <ColumnResolutionCard
                    key={res.column}
                    resolution={{ ...res, userChoice: choices[res.column]?.userChoice }}
                    index={i}
                    onChange={handleChange}
                    onTeach={handleTeach}
                  />
                ))}
              </div>
            )}

            {/* Nota de rodapé */}
            <div style={{
              display: "flex", gap: 8, padding: "10px 12px",
              background: "rgba(100,116,139,0.06)", borderRadius: 8,
              border: "1px solid #1a2234", marginTop: 4,
              fontSize: 11, color: "#475569", lineHeight: 1.6,
            }}>
              <Info size={13} style={{ color: "#4b5563", marginTop: 1, flexShrink: 0 }} />
              <span>
                As transformações selecionadas serão aplicadas antes da análise estatística.
                O sistema irá sugerir apenas testes compatíveis com as escalas de medida confirmadas aqui.
                Decisões salvas como "Ensinar" serão lembradas em análises futuras.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 24px",
            borderTop: "1px solid #1a2234",
            background: "#0b1221",
            flexShrink: 0,
          }}>
            <button
              onClick={onSkip}
              style={{
                padding: "9px 18px", borderRadius: 8,
                background: "transparent", border: "1px solid #253354",
                color: "#475569", fontSize: 13, cursor: "pointer",
              }}
            >
              Pular (usar padrões)
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {totalColumns > 0 && (
                <span style={{ fontSize: 12, color: "#475569" }}>
                  {totalColumns} coluna{totalColumns > 1 ? "s" : ""} revisada{totalColumns > 1 ? "s" : ""}
                </span>
              )}
              <button
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 22px", borderRadius: 8,
                  background: confirming ? "#2c3359" : "linear-gradient(135deg, #4f46e5, #6366f1)",
                  border: "none", color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: confirming ? "not-allowed" : "pointer",
                  boxShadow: confirming ? "none" : "0 4px 16px rgba(99,102,241,0.35)",
                  transition: "all 0.2s",
                }}
                id="domain-review-confirm-btn"
              >
                {confirming ? "Aplicando…" : "Confirmar e Continuar"}
                {!confirming && <ChevronRight size={15} />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Modal de ensino sobreposto */}
        {teachTarget && (
          <TeachDomainModal
            resolution={teachTarget}
            onClose={() => setTeachTarget(null)}
            onSave={handleTeachSave}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
