import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function ForestPlot({ className }) {
  return (
    <svg viewBox="0 0 40 20" preserveAspectRatio="xMidYMid meet" className={className} fill="currentColor">
      <rect x="0" y="8" width="40" height="4" />
      <polygon points="20,0 30,10 20,20 10,10" />
    </svg>
  )
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const features = [
  {
    title: 'Analise automatica por IA',
    description: 'Nossa IA detecta automaticamente os tipos de variaveis e sugere os testes estatisticos mais adequados para sua pesquisa.',
    icon: 'psychology'
  },
  {
    title: 'Motor estatistico profissional',
    description: 'Powered by Pingouin, SciPy e Statsmodels — as mesmas bibliotecas utilizadas em artigos cientificos de alto impacto.',
    icon: 'analytics'
  },
  {
    title: 'Interpretacao em portugues',
    description: 'Resultados interpretados automaticamente em portugues claro. Sem jargon estatistico complexo.',
    icon: 'translate'
  },
  {
    title: 'Graficos interativos',
    description: 'Visualize seus dados com graficos exportaveis para PowerPoint, PDF e Excel.',
    icon: 'show_chart'
  },
  {
    title: 'Analise de sobrevivencia',
    description: 'Kaplan-Meier, Log-Rank e Modelo de Cox integrados para pesquisas com dados de tempo.',
    icon: 'timeline'
  },
  {
    title: 'Metanalise completa',
    description: 'Combinacao de estudos com modelos de efeito fixo e aleatorio. Deteccao de vies de publicacao.',
    icon: 'hub'
  }
]

const faqs = [
  { q: 'Quais tipos de arquivo posso enviar?', a: 'Aceitamos CSV, Excel (.xlsx) e Google Sheets. O sistema detecta automaticamente o formato dos dados.' },
  { q: 'Preciso saber estatistica para usar?', a: 'Nao! Nossa IA sugere automaticamente o teste mais adequado e interpreta os resultados em portugues claro.' },
  { q: 'Os resultados sao validos para publicacao?', a: 'Sim. Utilizamos Pingouin, SciPy e Statsmodels — bibliotecas estatisticas validadas cientificamente. Os resultados seguem o padrao APA-7.' },
  { q: 'Posso usar para TCC e doutorado?', a: 'Absolutamente. O Paper Metrics e ideal para analises de dissertacoes, teses e artigos cientificos.' },
  { q: 'Quanto custa?', a: 'Estamos em fase de acesso antecipado gratuito. Solicite seu acesso e use todas as funcionalidades sem custo.' }
]

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistName, setWaitlistName] = useState('')
  const [waitlistInstitution, setWaitlistInstitution] = useState('')
  const [waitlistStatus, setWaitlistStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [waitlistMessage, setWaitlistMessage] = useState('')

  useEffect(() => { setMounted(true) }, [])

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  const handleWaitlist = async (e) => {
    e.preventDefault()
    if (!waitlistEmail.trim()) return
    setWaitlistStatus('loading')
    try {
      const res = await fetch(`${API_BASE}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: waitlistEmail.trim(),
          name: waitlistName.trim() || null,
          institution: waitlistInstitution.trim() || null
        })
      })
      const data = await res.json()
      if (res.ok) {
        setWaitlistStatus('success')
        setWaitlistMessage(data.message || 'Recebemos seu pedido!')
      } else {
        setWaitlistStatus('error')
        setWaitlistMessage(data.detail || 'Erro ao enviar. Tente novamente.')
      }
    } catch {
      setWaitlistStatus('error')
      setWaitlistMessage('Erro de conexao. Tente novamente.')
    }
  }

  const scrollToAccess = (e) => {
    e.preventDefault()
    setMobileMenu(false)
    document.getElementById('acesso')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#0a0a09] text-[#e7e5e4] overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-[#0a0a09]/80 border-b border-[#292524]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 text-[#5eead4]">
              <span className="text-xl font-semibold tracking-[-1px]">Paper</span>
              <ForestPlot className="w-5 h-2.5" />
              <span className="text-xl font-semibold tracking-[-1px]">Metrics</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#recursos" className="text-[#a8a29e] hover:text-[#e7e5e4] transition-colors text-sm font-medium">Recursos</a>
              <a href="#como-funciona" className="text-[#a8a29e] hover:text-[#e7e5e4] transition-colors text-sm font-medium">Como funciona</a>
              <a href="#acesso" className="text-[#a8a29e] hover:text-[#e7e5e4] transition-colors text-sm font-medium">Acesso</a>
              <a href="#faq" className="text-[#a8a29e] hover:text-[#e7e5e4] transition-colors text-sm font-medium">FAQ</a>
            </div>
            <div className="flex items-center gap-3">
              <a href="/login" className="hidden sm:block px-4 py-2 text-sm font-medium text-[#a8a29e] hover:text-[#e7e5e4] transition-colors">Entrar</a>
              <a href="#acesso" onClick={scrollToAccess} className="px-4 sm:px-5 py-2 bg-[#5eead4] hover:bg-[#99f6e4] text-[#134e4a] font-semibold text-sm rounded-lg transition-all">
                Solicitar acesso
              </a>
              <button
                onClick={() => setMobileMenu(!mobileMenu)}
                className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#a8a29e] hover:text-[#e7e5e4]"
              >
                <span className="material-symbols-rounded text-2xl">{mobileMenu ? 'close' : 'menu'}</span>
              </button>
            </div>
          </div>

          {/* Mobile menu drawer */}
          <AnimatePresence>
            {mobileMenu && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="md:hidden overflow-hidden border-t border-[#292524]"
              >
                <div className="flex flex-col gap-1 p-4">
                  <a href="#recursos" onClick={() => setMobileMenu(false)} className="px-4 py-3 text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-[#111110] rounded-lg transition-colors text-sm font-medium">Recursos</a>
                  <a href="#como-funciona" onClick={() => setMobileMenu(false)} className="px-4 py-3 text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-[#111110] rounded-lg transition-colors text-sm font-medium">Como funciona</a>
                  <a href="#acesso" onClick={scrollToAccess} className="px-4 py-3 text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-[#111110] rounded-lg transition-colors text-sm font-medium">Acesso</a>
                  <a href="#faq" onClick={() => setMobileMenu(false)} className="px-4 py-3 text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-[#111110] rounded-lg transition-colors text-sm font-medium">FAQ</a>
                  <a href="/login" onClick={() => setMobileMenu(false)} className="px-4 py-3 text-[#5eead4] hover:bg-[#111110] rounded-lg transition-colors text-sm font-medium">Entrar</a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={mounted ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#5eead4]/10 border border-[#5eead4]/20 text-[#5eead4] text-sm font-medium mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-[#5eead4] animate-pulse" />
              Early access gratuito
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={mounted ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl sm:text-5xl md:text-7xl font-semibold tracking-[-1.5px] mb-6 leading-[1.05]"
            >
              Analise estatistica
              <br />
              <span className="text-[#5eead4]">sem complicacao</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={mounted ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg text-[#a8a29e] mb-10 max-w-2xl mx-auto leading-relaxed"
            >
              O motor estatistico inteligente para pesquisadores. Faca upload dos seus dados e receba analises completas com interpretacao em portugues — pronto para publicacao.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={mounted ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <a href="#acesso" onClick={scrollToAccess} className="w-full sm:w-auto px-8 py-3.5 bg-[#5eead4] hover:bg-[#99f6e4] text-[#134e4a] font-semibold text-base rounded-lg transition-all">
                Solicitar acesso gratuito
              </a>
              <a href="#como-funciona" className="w-full sm:w-auto px-8 py-3.5 border border-[#292524] hover:border-[#57534e] text-[#a8a29e] font-medium text-base rounded-lg transition-all hover:bg-[#111110]">
                Ver como funciona
              </a>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={mounted ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-6 text-sm text-[#78716c]"
            >
              Gratuito durante o early access · Sem cartao de credito
            </motion.p>
          </div>

          {/* Hero Preview — Mockup de resultado real */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-16 relative"
          >
            <div className="rounded-xl overflow-hidden border border-[#292524] bg-[#111110]">
              <div className="p-4 border-b border-[#292524] flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#292524]" />
                <div className="w-3 h-3 rounded-full bg-[#292524]" />
                <div className="w-3 h-3 rounded-full bg-[#292524]" />
                <span className="ml-4 text-xs text-[#78716c]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Paper Metrics — Resultados</span>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { icon: 'check_circle', color: '#5eead4', title: 'Teste T independente', detail: 't(48) = 2.847, p = 0.006, d = 0.81 — Significativo, efeito grande' },
                  { icon: 'check_circle', color: '#5eead4', title: 'ANOVA one-way', detail: 'F(2, 87) = 5.12, p = 0.008, \u03B7\u00B2 = 0.105 — Significativo' },
                  { icon: 'info', color: '#a8a29e', title: 'Correlacao de Pearson', detail: 'r = 0.34, p = 0.041, IC 95% [0.02, 0.61] — Correlacao fraca' },
                  { icon: 'check_circle', color: '#5eead4', title: 'Qui-Quadrado', detail: '\u03C7\u00B2(1) = 6.24, p = 0.012, V = 0.35 — Associacao moderada' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={mounted ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.7 + i * 0.15 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-[#0a0a09]/50"
                  >
                    <span className="material-symbols-rounded text-lg mt-0.5" style={{ color: item.color }}>{item.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-[#e7e5e4]">{item.title}</div>
                      <div className="text-xs text-[#a8a29e] mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{item.detail}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="py-24 bg-[#111110]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-[42px] font-semibold tracking-[-1px] mb-4">Tres passos simples</h2>
            <p className="text-[#a8a29e] max-w-xl mx-auto">Da inscricao a publicacao, sem complicacao.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Conecte', description: 'Faca upload do seu arquivo CSV ou Excel. O sistema detecta automaticamente o formato dos dados.' },
              { step: '02', title: 'Analise', description: 'Nossa IA processa seus dados, detecta variaveis e executa os testes estatisticos mais adequados.' },
              { step: '03', title: 'Publique', description: 'Receba resultados completos com interpretacao em portugues e exporte para seu artigo.' }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="relative p-8 rounded-xl bg-[#111110] border border-[#292524] hover:border-[#5eead4]/30 transition-all"
              >
                <span className="text-6xl font-semibold text-[#292524] absolute top-4 right-6">{item.step}</span>
                <h3 className="text-lg font-semibold mb-3 text-[#5eead4]">{item.title}</h3>
                <p className="text-[#a8a29e] leading-relaxed text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-[42px] font-semibold tracking-[-1px] mb-4">Tudo que voce precisa</h2>
            <p className="text-[#a8a29e] max-w-xl mx-auto">Ferramentas profissionais para elevar a qualidade das suas analises.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                viewport={{ once: true }}
                className="p-6 rounded-xl bg-[#111110] border border-[#292524] hover:border-[#5eead4]/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-[#5eead4]/10 flex items-center justify-center mb-4">
                  <span className="material-symbols-rounded text-[#5eead4] text-xl">{feature.icon}</span>
                </div>
                <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                <p className="text-[#a8a29e] text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Early Access */}
      <section id="acesso" className="py-24 border-y border-[#292524]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#5eead4]/10 border border-[#5eead4]/20 text-[#5eead4] text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4] animate-pulse" />
                Early Access
              </div>
              <h2 className="text-3xl md:text-[42px] font-semibold tracking-[-1px] mb-4">
                Acesso antecipado gratuito
              </h2>
              <p className="text-[#a8a29e] mb-8 leading-relaxed">
                Estamos em fase de acesso antecipado. Deixe seu email e nossa equipe
                libera seu acesso com todas as funcionalidades — sem custo.
              </p>

              {waitlistStatus === 'success' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 rounded-xl bg-[#5eead4]/10 border border-[#5eead4]/20"
                >
                  <span className="material-symbols-rounded text-[#5eead4] text-3xl mb-3 block">check_circle</span>
                  <p className="text-[#e7e5e4] font-medium mb-1">{waitlistMessage}</p>
                  <p className="text-[#a8a29e] text-sm">Voce recebera um email quando seu acesso for liberado.</p>
                </motion.div>
              ) : (
                <form onSubmit={handleWaitlist} className="space-y-3 text-left">
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={e => setWaitlistEmail(e.target.value)}
                    placeholder="Seu melhor e-mail"
                    required
                    className="w-full py-3 px-4 bg-[#111110] border border-[#292524] rounded-lg text-sm outline-none text-[#e7e5e4] placeholder-[#78716c] focus:border-[#5eead4]/40 transition-all"
                  />
                  <input
                    type="text"
                    value={waitlistName}
                    onChange={e => setWaitlistName(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full py-3 px-4 bg-[#111110] border border-[#292524] rounded-lg text-sm outline-none text-[#e7e5e4] placeholder-[#78716c] focus:border-[#5eead4]/40 transition-all"
                  />
                  <input
                    type="text"
                    value={waitlistInstitution}
                    onChange={e => setWaitlistInstitution(e.target.value)}
                    placeholder="Instituicao (opcional)"
                    className="w-full py-3 px-4 bg-[#111110] border border-[#292524] rounded-lg text-sm outline-none text-[#e7e5e4] placeholder-[#78716c] focus:border-[#5eead4]/40 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={waitlistStatus === 'loading'}
                    className="w-full py-3.5 bg-[#5eead4] hover:bg-[#99f6e4] text-[#134e4a] font-semibold text-sm rounded-lg transition-all disabled:opacity-50"
                  >
                    {waitlistStatus === 'loading' ? 'Enviando...' : 'Solicitar acesso gratuito'}
                  </button>
                  {waitlistStatus === 'error' && (
                    <p className="text-red-400 text-xs text-center">{waitlistMessage}</p>
                  )}
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-[42px] font-semibold tracking-[-1px] mb-4">Perguntas frequentes</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                viewport={{ once: true }}
                className="border border-[#292524] rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full p-5 flex items-center justify-between text-left hover:bg-[#111110] transition-colors"
                >
                  <span className="font-medium text-sm">{faq.q}</span>
                  <span className={`material-symbols-rounded text-[#78716c] transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-[#a8a29e] text-sm">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-[#292524]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-[42px] font-semibold tracking-[-1px] mb-6">Pronto para elevar suas analises?</h2>
          <p className="text-[#a8a29e] mb-10 max-w-xl mx-auto">
            Solicite seu acesso gratuito e comece a produzir analises estatisticas de alta qualidade em minutos.
          </p>
          <a href="#acesso" onClick={scrollToAccess} className="inline-block px-8 py-3.5 bg-[#5eead4] hover:bg-[#99f6e4] text-[#134e4a] font-semibold text-base rounded-lg transition-all">
            Solicitar acesso gratuito
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-[#292524]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-2 text-[#5eead4]">
              <span className="text-lg font-semibold tracking-[-1px]">Paper</span>
              <ForestPlot className="w-4 h-2" />
              <span className="text-lg font-semibold tracking-[-1px]">Metrics</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[#78716c]">
              <a href="#" className="hover:text-[#e7e5e4] transition-colors">Termos</a>
              <a href="#" className="hover:text-[#e7e5e4] transition-colors">Privacidade</a>
              <a href="#" className="hover:text-[#e7e5e4] transition-colors">Contato</a>
            </div>
            <div className="text-sm text-[#78716c]">
              &copy; 2026 Paper Metrics. Todos os direitos reservados.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
