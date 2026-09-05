/**
 * Contrôle structurel du script, sans appeler personne.
 *
 * Une scène mal formée ne se voit qu'à la génération, et une génération se
 * paie. Ce script vérifie donc à froid tout ce qui peut l'être : identifiants,
 * ordre, blocs obligatoires, cohérence des renvois entre `naming` et `decor`.
 *
 *   node scripts/check-script.mjs
 */
import { readFileSync } from 'node:fs'

const script = JSON.parse(readFileSync(new URL('../game/script.json', import.meta.url), 'utf-8'))
const errors = []
const warn = []

const byId = new Map(script.scenes.map(s => [s.id, s]))
const order = script.progression.order

// --- progression ------------------------------------------------------------
if (!byId.has(script.progression.start_scene)) {
  errors.push(`progression.start_scene "${script.progression.start_scene}" n'existe pas`)
}
for (const id of order) if (!byId.has(id)) errors.push(`progression.order cite "${id}", absente de scenes`)
for (const s of script.scenes) if (!order.includes(s.id)) errors.push(`la scène "${s.id}" n'est pas dans progression.order`)
order.forEach((id, i) => {
  const s = byId.get(id)
  if (s && s.order !== i + 1) errors.push(`"${id}" : order=${s.order} mais rang ${i + 1} dans progression`)
})

// --- actes ------------------------------------------------------------------
const inActs = script.acts.flatMap(a => a.scenes)
for (const id of inActs) if (!byId.has(id)) errors.push(`l'acte cite "${id}", absente de scenes`)
for (const s of script.scenes) {
  if (s.id === script.progression.start_scene) continue
  if (!inActs.includes(s.id)) errors.push(`"${s.id}" n'appartient à aucun acte`)
  const act = script.acts.find(a => a.scenes.includes(s.id))
  if (act && s.act !== act.id) errors.push(`"${s.id}" : act="${s.act}" mais listée dans l'acte "${act.id}"`)
}

// --- chaque scène -----------------------------------------------------------
const ACQUISITIONS = ['informant_then_holder', 'holder', 'found']
for (const s of script.scenes) {
  // L'épilogue ne suit pas le schéma des autres : ni personnages, ni quête, ni
  // objet-clé. Il rend un texte et une image, et rien d'autre.
  if (s.kind === 'ending') {
    for (const k of ['image_setting', 'focal_element', 'decor_slots', 'generation']) {
      if (!s[k]) errors.push(`"${s.id}" (épilogue) : bloc "${k}" manquant`)
    }
    const out = s.generation?.output_schema ?? {}
    for (const k of ['ending_html', 'palette', 'decor']) {
      if (!out[k]) errors.push(`"${s.id}" (épilogue) : le schéma de sortie ne demande pas "${k}"`)
    }
    if (!s.generation?.instruction?.includes('<h2>')) {
      errors.push(`"${s.id}" (épilogue) : l'instruction ne fixe pas les balises autorisées`)
    }
    // La fin doit viser la résolution déclarée, sinon elle n'est plus la fin
    // de CETTE histoire mais une conclusion interchangeable.
    for (const token of ['{{tension}}', '{{resolution}}', '{{acts}}']) {
      if (!s.theme_frame?.instruction?.includes(token)) {
        errors.push(`"${s.id}" (épilogue) : theme_frame n'interpole pas ${token}`)
      }
    }
    continue
  }

  const need = ['title', 'image_setting', 'focal_element', 'naming', 'decor_slots',
                'npcs', 'quest', 'interactables', 'exits', 'key_item', 'objective']
  for (const k of need) if (!s[k]) errors.push(`"${s.id}" : bloc "${k}" manquant`)
  if (!s.decor_slots?.length) errors.push(`"${s.id}" : aucun élément de décor`)
  if (!s.exits?.[0]?.label) errors.push(`"${s.id}" : aucune sortie nommée`)
  if (!s.npcs?.count) errors.push(`"${s.id}" : npcs.count manquant`)

  const acq = s.key_item?.acquisition
  if (acq && !ACQUISITIONS.includes(acq)) errors.push(`"${s.id}" : acquisition "${acq}" inconnue`)
  // Trois rôles distincts exigent au moins trois personnages.
  if (acq === 'informant_then_holder' && s.npcs?.count < 3) {
    errors.push(`"${s.id}" : ${s.npcs.count} PNJ pour un motif qui en demande 3 (accueil, informateur, détenteur)`)
  }

  // `naming.must_reference` pointe vers un slot : il doit exister.
  for (const ref of s.naming?.must_reference ?? []) {
    if (!ref.startsWith('decor.')) continue
    const slot = ref.slice('decor.'.length)
    if (!s.decor_slots.some(d => d.id === slot)) {
      errors.push(`"${s.id}" : naming renvoie au décor "${slot}", qui n'existe pas`)
    }
  }
  // Un seul slot d'accent : c'est lui qui porte la couleur du lieu.
  const accents = s.decor_slots?.filter(d => d.visual_weight === 'accent') ?? []
  if (accents.length !== 1) warn.push(`"${s.id}" : ${accents.length} éléments d'accent (1 attendu)`)
}

// --- positions face à la tension --------------------------------------------
const POSTURES = Object.keys(script.onomastics.posture)
for (const s of script.scenes) {
  const stances = s.cast_stances
  if (!stances || s.kind === 'ending') continue

  if (stances.length !== s.npcs.count) {
    errors.push(`"${s.id}" : ${stances.length} positions pour ${s.npcs.count} personnages`)
  }
  for (const st of stances) {
    if (!POSTURES.includes(st.posture)) errors.push(`"${s.id}" : posture "${st.posture}" absente du syllabaire`)
    if (st.means !== script.onomastics.posture[st.posture]) {
      errors.push(`"${s.id}" : le sens de "${st.posture}" ne correspond plus au syllabaire`)
    }
  }

  const list = stances.map(x => x.posture)
  const { holder_stance: holder, informant_stance: informant, acquisition } = s.key_item
  if (holder && !list.includes(holder)) errors.push(`"${s.id}" : détenteur "${holder}" hors distribution`)
  if (informant && !list.includes(informant)) errors.push(`"${s.id}" : informateur "${informant}" hors distribution`)

  if (acquisition === 'informant_then_holder') {
    if (!holder || !informant) errors.push(`"${s.id}" : motif à trois rôles sans détenteur ou sans informateur désigné`)
    if (holder && holder === informant) errors.push(`"${s.id}" : détenteur et informateur sur la même position`)
    // Celui qui accueille expose, il ne résout rien : la validation serveur le refuse.
    if (holder === list[0] || informant === list[0]) {
      errors.push(`"${s.id}" : celui qui accueille (${list[0]}) ne peut être ni détenteur ni informateur`)
    }
  }
  if (acquisition === 'found' && holder) errors.push(`"${s.id}" : objet à trouver, mais un détenteur est désigné`)
  if (acquisition === 'holder' && !holder) errors.push(`"${s.id}" : motif à détenteur sans détenteur désigné`)

  // Une facette doit exister et désigner un vrai nombre.
  const facet = s.theme_focus?.facet
  if (!facet) errors.push(`"${s.id}" : theme_focus manquant`)
  else if (!['drive', 'destiny', 'reception'].includes(facet)) {
    errors.push(`"${s.id}" : facette "${facet}" inconnue`)
  }
  if (s.objective && !s.objective.requirement && !s.objective.statement) {
    errors.push(`"${s.id}" : objectif sans exigence`)
  }
}
if (!script.defaults.objective_derivation?.instruction?.includes('{{requirement}}')) {
  errors.push('objective_derivation n\'interpole pas {{requirement}}')
}

// --- continuité -------------------------------------------------------------
const c = script.defaults.continuity
if (!c?.prompt?.includes('{{journal}}')) errors.push('continuity.prompt n\'interpole pas {{journal}}')
if (!c?.empty) errors.push('continuity.empty manquant')

// --- unicité des noms de lieux ----------------------------------------------
const titles = script.scenes.map(s => s.title)
for (const t of new Set(titles)) {
  if (titles.filter(x => x === t).length > 1) errors.push(`titre en double : "${t}"`)
}

for (const w of warn) console.warn('  ! ' + w)
if (errors.length) {
  console.error(`${errors.length} problème(s) dans le script :`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log(`Script cohérent : ${script.scenes.length} scènes, ${script.acts.length} actes, `
  + `${order.length} étapes de progression.`)
