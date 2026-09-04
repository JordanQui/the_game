<script setup lang="ts">
/**
 * Tableau de bord économique.
 *
 * Distinction à garder en tête en lisant cette page : les PRIX UNITAIRES
 * viennent de la facture OpenAI réelle, les VOLUMES sont des hypothèses. La
 * page les sépare visuellement pour qu'on ne confonde jamais les deux.
 */
type Data = {
  pricing: { input_per_1m_usd: number; output_per_1m_usd: number; image_per_call_usd: number; scene_budget_usd: number }
  limits: {
    scenes_per_session: number; turns_per_session: number; images_per_session: number
    paid: { scenes_per_window: number; turns_per_window: number; images_per_window: number; window_days: number }
  }
  economics: {
    eur_usd: number; price_eur: number; conversion_rate_pct: number
    payment: { fee_pct: number; fee_fixed_eur: number }
    experience: { scenes_total: number; free_scenes: number; turns_per_scene: number }
    free_visitor: { scenes: number; turns: number; images: number }
    paying_customer: { scenes: number; turns: number; images: number }
  }
  art: { image_size: string }
}

// Voir middleware/admin.ts : la page n'existe qu'en développement.
definePageMeta({ middleware: 'admin' })

const { data, error } = await useFetch<Data>('/api/admin/economics')

// Curseurs. Initialisés depuis le script, ajustables à la main.
const visits = ref(10_000)
const conversionPct = ref(3)
watchEffect(() => {
  if (data.value) conversionPct.value = data.value.economics.conversion_rate_pct
})

const eur = (usd: number) => usd / (data.value?.economics.eur_usd ?? 1.08)
const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
const money = (n: number) => `${fmt(n)} €`
const int = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n))

/** Coût d'une opération, en euros, depuis les prix unitaires réels. */
const unit = computed(() => {
  const p = data.value?.pricing
  if (!p) return { sceneText: 0, turn: 0, image: 0 }
  return {
    // Mesures de taille de prompt relevées sur le script réel.
    sceneText: eur(3500 / 1e6 * p.input_per_1m_usd + 1900 / 1e6 * p.output_per_1m_usd),
    turn: eur(1900 / 1e6 * p.input_per_1m_usd + 220 / 1e6 * p.output_per_1m_usd),
    image: eur(p.image_per_call_usd),
  }
})

const costOf = (u: { scenes: number; turns: number; images: number }) =>
  u.scenes * unit.value.sceneText + u.turns * unit.value.turn + u.images * unit.value.image

/** L'expérience de bout en bout : l'auberge gratuite puis les scènes payantes. */
const experience = computed(() => {
  const e = data.value?.economics
  if (!e) return { free: 0, paid: 0, total: 0, images: 0, turns: 0, texts: 0 }
  const x = e.experience
  const paidScenes = x.scenes_total - x.free_scenes

  const texts = x.scenes_total * unit.value.sceneText
  const images = paidScenes * unit.value.image
  const turns = x.scenes_total * x.turns_per_scene * unit.value.turn
  const free = unit.value.sceneText + x.turns_per_scene * unit.value.turn

  return { free, paid: texts + images + turns - free, total: texts + images + turns, images, turns, texts }
})

const freeCost = computed(() => costOf(data.value?.economics.free_visitor ?? { scenes: 0, turns: 0, images: 0 }))
const paidCost = computed(() => costOf(data.value?.economics.paying_customer ?? { scenes: 0, turns: 0, images: 0 }))

/** Le pire cas autorisé par les quotas, si quelqu'un les épuise. */
const freeCeiling = computed(() => {
  const l = data.value?.limits
  return l ? costOf({ scenes: l.scenes_per_session, turns: l.turns_per_session, images: l.images_per_session }) : 0
})
const paidCeiling = computed(() => {
  const l = data.value?.limits.paid
  return l ? costOf({ scenes: l.scenes_per_window, turns: l.turns_per_window, images: l.images_per_window }) : 0
})

/** Ce que Square prélève sur chaque encaissement. */
const feePerSale = computed(() => {
  const e = data.value?.economics
  if (!e) return 0
  return e.price_eur * e.payment.fee_pct / 100 + e.payment.fee_fixed_eur
})

const netPerSale = computed(() => (data.value?.economics.price_eur ?? 0) - feePerSale.value - paidCost.value)

function project(v: number, ratePct: number) {
  const buyers = v * ratePct / 100
  const revenue = buyers * (data.value?.economics.price_eur ?? 0)
  const fees = buyers * feePerSale.value
  const costFree = (v - buyers) * freeCost.value
  const costPaid = buyers * paidCost.value
  const net = revenue - fees - costFree - costPaid
  return { buyers, revenue, fees, costFree, costPaid, net, margin: revenue ? net / revenue * 100 : 0 }
}

const current = computed(() => project(visits.value, conversionPct.value))
const scenarios = computed(() =>
  [1_000, 10_000, 100_000, 1_000_000].map(v => ({ visits: v, ...project(v, conversionPct.value) })))

/** Trafic à partir duquel l'opération devient rentable. */
const breakEven = computed(() => {
  const perBuyer = netPerSale.value
  const rate = conversionPct.value / 100
  const perVisit = perBuyer * rate - freeCost.value * (1 - rate)
  return perVisit > 0 ? 0 : Infinity
})
</script>

<template>
  <div class="min-h-[100dvh] px-5 py-10 sm:px-8">
    <div class="mx-auto w-full max-w-4xl space-y-10">

      <div v-if="error" class="border border-neon-600/40 p-6 space-y-2">
        <p class="font-display uppercase tracking-[0.2em] text-neon-400 text-xs">Données indisponibles</p>
        <p class="text-ink-200/80 text-sm">
          Impossible de lire <code class="text-neon-300">game/script.json</code>.
        </p>
      </div>

      <template v-else-if="data">
        <header class="space-y-4">
          <p class="font-display text-[10px] uppercase tracking-[0.4em] text-neon-400/80">Économie du jeu</p>
          <h1 class="neon-text font-display uppercase text-2xl sm:text-3xl tracking-[0.05em]">Coûts &amp; marges</h1>
          <div class="neon-rule w-32" />
        </header>

        <!-- Le chiffre qui compte -->
        <section class="border border-neon-600/40 p-6 space-y-5">
          <p class="font-display text-[10px] uppercase tracking-[0.28em] text-neon-400/80">
            Une expérience complète — {{ data.economics.experience.scenes_total }} scènes,
            {{ data.economics.experience.turns_per_scene }} tours chacune
          </p>
          <p class="neon-text font-display text-4xl">{{ money(experience.total) }}</p>
          <p class="text-ink-200/80 text-sm leading-relaxed">
            Coût IA total, de l'auberge à la dernière scène. Dont
            {{ money(experience.free) }} avant paiement — l'auberge, que vous offrez —
            et {{ money(experience.paid) }} après.
          </p>
          <div class="grid gap-3 sm:grid-cols-3 pt-1">
            <div v-for="c in [
              { label: 'Images', value: experience.images, detail: `${data.economics.experience.scenes_total - data.economics.experience.free_scenes} générées` },
              { label: 'Tours de jeu', value: experience.turns, detail: `${data.economics.experience.scenes_total * data.economics.experience.turns_per_scene} au total` },
              { label: 'Textes de scène', value: experience.texts, detail: `${data.economics.experience.scenes_total} générations` },
            ]" :key="c.label" class="space-y-1">
              <p class="text-steel-400 text-[10px] uppercase tracking-[0.18em] font-display">{{ c.label }}</p>
              <p class="text-ink-100 font-display text-lg">{{ money(c.value) }}</p>
              <p class="text-ink-300 text-[11px]">
                {{ c.detail }} — {{ fmt(c.value / experience.total * 100, 0) }} % du total
              </p>
            </div>
          </div>
        </section>

        <!-- Prix unitaires -->
        <section class="space-y-4">
          <h2 class="font-display text-[11px] uppercase tracking-[0.28em] text-ink-100">
            Prix unitaires <span class="text-neon-400/80">— mesurés sur facture</span>
          </h2>
          <div class="grid gap-3 sm:grid-cols-3">
            <div v-for="c in [
              { label: 'Texte d\'une scène', value: unit.sceneText, detail: '~3 500 tokens entrée + 1 900 sortie' },
              { label: 'Un tour de jeu', value: unit.turn, detail: '~1 900 entrée + 220 sortie' },
              { label: `Une image ${data.art.image_size}`, value: unit.image, detail: 'facturée à l\'unité' },
            ]" :key="c.label" class="border border-steel-600/60 p-4 space-y-1">
              <p class="text-steel-400 text-[10px] uppercase tracking-[0.18em] font-display">{{ c.label }}</p>
              <p class="text-neon-300 font-display text-xl">{{ fmt(c.value * 100, 2) }} c</p>
              <p class="text-ink-300 text-[11px]">{{ c.detail }}</p>
            </div>
          </div>
        </section>

        <!-- Par visiteur -->
        <section class="space-y-4">
          <h2 class="font-display text-[11px] uppercase tracking-[0.28em] text-ink-100">
            Par visiteur <span class="text-steel-400">— volumes estimés</span>
          </h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="border border-steel-600/60 p-5 space-y-3">
              <p class="font-display text-[10px] uppercase tracking-[0.2em] text-steel-400">Visiteur gratuit</p>
              <p class="text-ink-100 font-display text-2xl">{{ fmt(freeCost * 100, 1) }} c</p>
              <p class="text-ink-300 text-xs leading-relaxed">
                {{ data.economics.free_visitor.scenes }} scène,
                {{ data.economics.free_visitor.turns }} tours, aucune image —
                l'auberge a son illustration figée.
              </p>
              <p class="text-steel-400 text-[11px]">
                Plafond si le quota est épuisé : {{ fmt(freeCeiling * 100, 1) }} c
              </p>
            </div>
            <div class="border border-neon-600/40 p-5 space-y-3">
              <p class="font-display text-[10px] uppercase tracking-[0.2em] text-neon-400/80">Client payant</p>
              <p class="text-neon-300 font-display text-2xl">{{ money(netPerSale) }} net</p>
              <ul class="text-ink-300 text-xs space-y-1">
                <li>Prix de vente : {{ money(data.economics.price_eur) }}</li>
                <li>— commission Square : {{ money(feePerSale) }}</li>
                <li>— IA des {{ data.economics.paying_customer.scenes }} scènes : {{ money(paidCost) }}</li>
              </ul>
              <p class="text-neon-400/70 text-[11px]">
                Vous conservez {{ fmt(netPerSale / data.economics.price_eur * 100, 0) }} % du prix.
              </p>
              <p class="text-steel-400 text-[11px]">
                Plafond si le quota est épuisé : {{ money(paidCeiling) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Simulateur -->
        <section class="space-y-5 border-y border-neon-600/25 py-8">
          <h2 class="font-display text-[11px] uppercase tracking-[0.28em] text-ink-100">Simulateur</h2>

          <div class="grid gap-6 sm:grid-cols-2">
            <label class="space-y-2 block">
              <span class="flex justify-between font-display text-[10px] uppercase tracking-[0.18em] text-steel-400">
                <span>Visites</span><span class="text-neon-300">{{ int(visits) }}</span>
              </span>
              <input v-model.number="visits" type="range" min="100" max="1000000" step="100" class="w-full accent-neon-500">
            </label>
            <label class="space-y-2 block">
              <span class="flex justify-between font-display text-[10px] uppercase tracking-[0.18em] text-steel-400">
                <span>Taux de conversion</span><span class="text-neon-300">{{ fmt(conversionPct, 1) }} %</span>
              </span>
              <input v-model.number="conversionPct" type="range" min="0.1" max="15" step="0.1" class="w-full accent-neon-500">
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-4">
            <div v-for="c in [
              { label: 'Acheteurs', value: int(current.buyers) },
              { label: 'Chiffre d\'affaires', value: money(current.revenue) },
              { label: 'Coûts totaux', value: money(current.costFree + current.costPaid + current.fees) },
              { label: 'Résultat net', value: money(current.net) },
            ]" :key="c.label" class="border border-steel-600/60 p-4 space-y-1">
              <p class="text-steel-400 text-[10px] uppercase tracking-[0.18em] font-display">{{ c.label }}</p>
              <p class="font-display text-lg" :class="c.label === 'Résultat net' && current.net < 0 ? 'text-red-400' : 'text-ink-100'">
                {{ c.value }}
              </p>
            </div>
          </div>

          <p class="text-ink-300 text-xs leading-relaxed">
            Dont {{ money(current.costFree) }} pour les
            {{ int(visits - current.buyers) }} visiteurs qui ne convertissent pas — c'est
            le poste qui décide de tout : il croît avec le trafic sans rien rapporter.
          </p>
        </section>

        <!-- Scénarios -->
        <section class="space-y-4">
          <h2 class="font-display text-[11px] uppercase tracking-[0.28em] text-ink-100">
            Si ça prend <span class="text-steel-400">— à {{ fmt(conversionPct, 1) }} % de conversion</span>
          </h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="text-steel-400 font-display text-[10px] uppercase tracking-[0.16em]">
                  <th class="text-left py-2 pr-4 font-normal">Visites</th>
                  <th class="text-right py-2 px-3 font-normal">Acheteurs</th>
                  <th class="text-right py-2 px-3 font-normal">CA</th>
                  <th class="text-right py-2 px-3 font-normal">Coût gratuits</th>
                  <th class="text-right py-2 px-3 font-normal">Net</th>
                  <th class="text-right py-2 pl-3 font-normal">Marge</th>
                </tr>
              </thead>
              <tbody class="text-ink-200/85">
                <tr v-for="s in scenarios" :key="s.visits" class="border-t border-steel-700/60">
                  <td class="py-2.5 pr-4 font-display text-neon-300/90">{{ int(s.visits) }}</td>
                  <td class="py-2.5 px-3 text-right tabular-nums">{{ int(s.buyers) }}</td>
                  <td class="py-2.5 px-3 text-right tabular-nums">{{ money(s.revenue) }}</td>
                  <td class="py-2.5 px-3 text-right tabular-nums text-steel-400">{{ money(s.costFree) }}</td>
                  <td class="py-2.5 px-3 text-right tabular-nums" :class="s.net < 0 ? 'text-red-400' : 'text-ink-100'">
                    {{ money(s.net) }}
                  </td>
                  <td class="py-2.5 pl-3 text-right tabular-nums">{{ fmt(s.margin, 0) }} %</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="breakEven === Infinity" class="text-red-400/90 text-xs leading-relaxed">
            À ce taux de conversion, chaque visite coûte plus qu'elle ne rapporte : le résultat
            devient d'autant plus négatif que le trafic augmente. Un buzz serait une mauvaise
            nouvelle.
          </p>
          <p v-else class="text-ink-300 text-xs leading-relaxed">
            À ce taux, chaque visite est rentable en moyenne : le résultat croît avec le trafic.
          </p>
        </section>

        <p class="text-steel-400 text-[11px] leading-relaxed border-t border-steel-700/60 pt-5">
          Les prix unitaires viennent de la facture OpenAI réelle. Les volumes par visiteur, le taux
          de conversion et la commission Square sont des <strong class="text-ink-200">hypothèses</strong>,
          déclarées dans <code class="text-neon-300/80">game/script.json</code> sous
          <code class="text-neon-300/80">economics</code>. À réviser dès qu'il existe du trafic réel.
        </p>
      </template>
    </div>
  </div>
</template>
