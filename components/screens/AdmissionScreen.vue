<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'
import {
  emptyAdmissionForm,
  profileFromAdmission,
  AGREEMENT_CHOICES,
  PASSION_EXAMPLES,
} from '~/utils/admission'

/**
 * Le formulaire d'admission.
 *
 * Il remplace la connexion Meta : ce que le compte donnait, le joueur le
 * déclare. On ne demande que ce que le jeu consomme réellement — l'inventaire
 * des champs est en tête de utils/admission.ts.
 *
 * Six écrans plutôt qu'une longue page : sur téléphone, une colonne de vingt
 * champs se referme avant d'être remplie. Seule la première étape est
 * obligatoire — le nom et la date fondent le signe et les nombres, tout le
 * reste enrichit sans jamais bloquer l'entrée.
 *
 * TOUT SE TAPE, sauf l'accord grammatical. Les grilles de touches ont été
 * retirées : une touche rend au générateur un vocabulaire qu'il a lui-même
 * écrit, et deux joueurs qui cochent la même case traversent la même nuit. Ce
 * que le joueur tape, personne d'autre ne l'a tapé. Les listes d'avant
 * survivent en EXEMPLES sous les champs — elles amorcent, elles ne répondent
 * pas.
 */
const playerStore = usePlayerStore()
const gameStore = useGameStore()

const form = reactive(emptyAdmissionForm())

const STEPS = [
  { title: 'Identité', legend: 'Le bureau consigne qui se présente.' },
  { title: 'Origine', legend: 'D\'où vous venez, où vous dormez.' },
  { title: 'Attaches', legend: 'Ce à quoi vous tenez, hors service.' },
  { title: 'Bascules', legend: 'Les fois où votre vie a changé de rue.' },
  { title: 'Empreintes', legend: 'Quatre détails. La nuit les remettra devant vous.' },
  { title: 'Nuits', legend: 'Le service consigne l\'emploi de vos nuits.' },
]

const step = ref(0)
/** `form` tant qu'on remplit, `verdict` une fois le dossier déposé. */
const phase = ref<'form' | 'verdict'>('form')

/** Le prénom et la date : sans eux, ni signe, ni nombres, ni nom à l'écran. */
const canAdvance = computed(() => {
  if (step.value > 0) return true
  return form.firstName.trim().length >= 2 && form.birthday.length === 10
})

/**
 * Entrée passe à l'étape suivante — mais pas depuis une zone de texte, où la
 * touche sert à écrire. Les nuits et le rêve sont les deux seuls champs
 * multilignes du dossier.
 */
function onEnter(event: KeyboardEvent) {
  if ((event.target as HTMLElement | null)?.tagName === 'TEXTAREA') return
  next()
}

function next() {
  if (!canAdvance.value) return
  if (step.value < STEPS.length - 1) step.value++
  else submit()
}

function back() {
  if (step.value > 0) step.value--
}

/**
 * Le dossier est déposé. Le profil part dans le store — c'est lui que
 * `SceneBuildScreen` enverra à la génération — et l'écran bascule sur la
 * réponse de la commission.
 */
function submit() {
  playerStore.setProfile(profileFromAdmission(form))
  phase.value = 'verdict'
}

function enterCity() {
  gameStore.setScreen('scene_build_loading')
}

function cancel() {
  gameStore.setScreen('login')
}

/**
 * Numéro de dossier. Dérivé du nom, jamais tiré au hasard : deux affichages du
 * même dossier doivent porter le même numéro, et un Math.random() ferait
 * diverger le rendu.
 */
const fullName = computed(
  () => [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' '))

const fileNumber = computed(() => {
  const seed = [...fullName.value.toUpperCase()].reduce((n, c) => n + c.charCodeAt(0), 0)
  return String(4200 + (seed % 5700)).padStart(4, '0')
})

const displayName = computed(() => fullName.value || 'Sans-nom')
const displayCity = computed(() => form.currentCity.trim() || 'quelque part sous la pluie')
</script>

<template>
  <div class="relative min-h-[100dvh] overflow-y-auto px-5 py-10 flex flex-col items-center">
    <!-- Lueur basse, comme sur l'accueil : c'est la même nuit -->
    <div
      class="fixed inset-x-0 bottom-0 h-[45vh] pointer-events-none"
      style="background: radial-gradient(90% 100% at 50% 100%, rgb(var(--neon-500) / 0.16) 0%, transparent 70%)"
    />

    <div class="relative z-10 w-full max-w-md">
      <!-- ================= LE FORMULAIRE ================= -->
      <template v-if="phase === 'form'">
        <div class="text-center space-y-3 mb-8">
          <p class="text-steel-400 text-[10px] uppercase tracking-[0.4em] font-display">
            Bureau des entrées — secteur 7
          </p>
          <h1 class="neon-text font-display uppercase text-2xl sm:text-[1.9rem] tracking-[0.06em] leading-tight">
            Formulaire<br>d'admission
          </h1>
          <div class="neon-rule w-28 mx-auto" />
        </div>

        <!-- Avancement : un cran par étape, le cran courant seul est allumé -->
        <div class="flex items-center gap-1.5 mb-6">
          <span
            v-for="(s, i) in STEPS"
            :key="s.title"
            class="h-[3px] flex-1 transition-colors duration-300"
            :class="i < step ? 'bg-neon-600/70' : i === step ? 'bg-neon-400' : 'bg-steel-700'"
          />
        </div>

        <div
          class="dossier relative bg-ink-900/85 border border-neon-600/40 p-6 sm:p-7 space-y-6"
          @keyup.enter="onEnter"
        >
          <span class="absolute inset-[5px] border border-neon-500/12 pointer-events-none" />

          <div class="relative space-y-1">
            <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.32em] font-display">
              Étape {{ step + 1 }} / {{ STEPS.length }} — {{ STEPS[step].title }}
            </p>
            <p class="text-steel-400 text-[11px] leading-relaxed">{{ STEPS[step].legend }}</p>
          </div>

          <!--
            1. IDENTITÉ — prénom et nom SÉPARÉS, et ce n'est pas cosmétique :
            le prénom porte le namank (l'accueil du monde), le nom complet
            porte l'héritage. Les réunir ferait perdre l'un des deux nombres.
          -->
          <div v-if="step === 0" class="relative space-y-5">
            <div class="grid grid-cols-2 gap-3">
              <label class="block space-y-2">
                <span class="field-label">Prénom</span>
                <input v-model="form.firstName" type="text" class="field" placeholder="celui qu'on vous crie" autocomplete="given-name">
              </label>
              <label class="block space-y-2">
                <span class="field-label">Nom</span>
                <input v-model="form.lastName" type="text" class="field" placeholder="celui qu'on vous a laissé" autocomplete="family-name">
              </label>
            </div>

            <label class="block space-y-2">
              <span class="field-label">Date de naissance</span>
              <input v-model="form.birthday" type="date" class="field" max="2020-12-31">
              <span class="field-hint">Le bureau vérifie le jour, l'heure ne l'intéresse pas.</span>
            </label>

            <div class="space-y-2">
              <span class="field-label">Accord</span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="choice in AGREEMENT_CHOICES"
                  :key="choice.value"
                  type="button"
                  class="chip"
                  :class="form.agreement === choice.value && 'chip-on'"
                  @click="form.agreement = choice.value"
                >
                  {{ choice.label }}
                </button>
              </div>
              <span class="field-hint">
                On vous écrira « {{ AGREEMENT_CHOICES.find(c => c.value === form.agreement)?.example }} ».
              </span>
            </div>
          </div>

          <!-- 2. ORIGINE -->
          <div v-else-if="step === 1" class="relative space-y-5">
            <label class="block space-y-2">
              <span class="field-label">Ville d'origine</span>
              <input v-model="form.hometown" type="text" class="field" placeholder="celle où vous êtes né">
            </label>
            <label class="block space-y-2">
              <span class="field-label">Ville actuelle</span>
              <input v-model="form.currentCity" type="text" class="field" placeholder="celle où vous rentrez le soir">
              <span class="field-hint">La ville de la nuit s'y accrochera : rues, pluie, habitudes.</span>
            </label>
          </div>

          <!-- 3. PASSIONS -->
          <div v-else-if="step === 2" class="relative space-y-4">
            <p class="text-ink-200/70 text-[12px] leading-relaxed">
              Trois lignes, et l'ordre compte : la première pèse le plus lourd
              dans votre nuit. Écrivez-les comme vous les diriez — un objet, un
              lieu, une heure valent mieux qu'une catégorie.
            </p>
            <!--
              Trois lignes libres, et plus une seule touche : « musique et
              concerts » vaut pour un million de personnes, ce que le joueur
              tape n'en désigne qu'une. Les anciens thèmes servent de
              placeholders — ils amorcent, ils ne répondent pas.
            -->
            <div class="space-y-4">
              <label v-for="(example, i) in PASSION_EXAMPLES" :key="i" class="block space-y-2">
                <span class="field-label">
                  {{ ['Ce à quoi vous tenez le plus', 'Ensuite', 'Et encore'][i] }}
                </span>
                <input
                  v-model="form.passions[i]"
                  type="text"
                  class="field"
                  :placeholder="example"
                >
              </label>
            </div>

            <div class="h-px bg-neon-600/20" />

            <!--
              Le morceau. Élément SECONDAIRE, et tenu comme tel : il ne sera
              jamais cité — ni ses paroles, ni son titre — et le récit ne se
              bâtit pas dessus. Il sert de registre aux personnages, pour ce
              qu'on entend derrière une porte. Voir describeUser().
            -->
            <div class="grid grid-cols-2 gap-3">
              <label class="block space-y-2">
                <span class="field-label">Un morceau</span>
                <input v-model="form.anthemTitle" type="text" class="field" placeholder="celui que vous remettez">
              </label>
              <label class="block space-y-2">
                <span class="field-label">Qui le joue</span>
                <input v-model="form.anthemArtist" type="text" class="field" placeholder="si vous savez">
              </label>
            </div>
            <span class="field-hint">
              On ne le citera pas. On s'en servira pour ce qu'on entend derrière une porte.
            </span>
          </div>

          <!-- 4. TOURNANTS -->
          <div v-else-if="step === 3" class="relative space-y-5">
            <p class="text-ink-200/70 text-[12px] leading-relaxed">
              Facultatif, mais c'est ce qui donne à la nuit de quoi vous
              reconnaître. Une ligne suffit : un départ, une rupture, un métier
              lâché, une ville quittée.
            </p>
            <label class="block space-y-2">
              <span class="field-label">Première bascule</span>
              <input v-model="form.turningPoints[0]" type="text" class="field" placeholder="ce qui a tout déplacé">
            </label>
            <label class="block space-y-2">
              <span class="field-label">Seconde bascule</span>
              <input v-model="form.turningPoints[1]" type="text" class="field" placeholder="et celle d'après">
            </label>
          </div>

          <!--
            5. EMPREINTES — les quatre seuls champs qui ne racontent pas un
            état civil. Ils reviennent en décor : l'objet sur une table, le
            refuge en façade, le prénom dans la bouche d'un inconnu, et ce qu'il
            ne supporte pas juste en travers de son chemin.
          -->
          <div v-else-if="step === 4" class="relative space-y-5">
            <label class="block space-y-2">
              <span class="field-label">Un objet auquel vous tenez</span>
              <input v-model="form.keepsake" type="text" class="field" placeholder="celui que vous ne jetterez pas">
            </label>
            <label class="block space-y-2">
              <span class="field-label">Où vous allez quand ça ne va pas</span>
              <input v-model="form.refuge" type="text" class="field" placeholder="un bar, un quai, une chambre">
            </label>
            <label class="block space-y-2">
              <span class="field-label">Quelqu'un qui compte <span class="text-steel-500">— prénom seul</span></span>
              <input v-model="form.ally" type="text" class="field" placeholder="on ne vous demandera rien de plus">
            </label>
            <label class="block space-y-2">
              <span class="field-label">Ce que vous ne supportez pas</span>
              <input v-model="form.aversion" type="text" class="field" placeholder="la nuit s'en servira">
            </label>
          </div>

          <!--
            6. NUITS — la seule étape qui ne consigne pas un état civil.
            La question est posée en CONDITIONNEL : « quel dormeur êtes-vous »
            n'appelle rien de la part de qui dort bien, alors que des nuits sans
            sommeil, tout le monde en a. Et les réponses se passent DEHORS —
            le jeu est une nuit dans une ville, un quai ou un dernier bar lui
            donnent un décor, le plafond d'une chambre ne lui donne rien.
            Le rêve, PARCE QU'IL REVIENT, est le seul motif du dossier qu'une
            scène peut reposer sans lasser.
            Deux lignes libres, et plus de touches : ici plus qu'ailleurs, le
            joueur est le seul à pouvoir écrire ce qu'il fait de ses nuits.
          -->
          <div v-else class="relative space-y-5">
            <p class="text-ink-200/70 text-[12px] leading-relaxed">
              Tout le monde en a. Ce sont celles passées dehors qui nous
              intéressent : il n'y a pas de mauvaise réponse, seulement des
              heures non déclarées.
            </p>

            <label class="block space-y-2">
              <span class="field-label">Les nuits où vous ne dormez pas</span>
              <textarea
                v-model="form.awakeNote"
                rows="2"
                class="field field-multi"
                placeholder="à trois heures, vous êtes où, et vous faites quoi"
              />
              <span class="field-hint">
                Dehors, de préférence : un quai, un dernier bar, un retour à
                pied. Un plafond de chambre ne donne rien à fabriquer à la ville.
              </span>
            </label>

            <label class="block space-y-2">
              <span class="field-label">Le rêve qui revient</span>
              <textarea
                v-model="form.dreamNote"
                rows="2"
                class="field field-multi"
                placeholder="celui que vous refaites, pas le dernier en date"
              />
              <span class="field-hint">
                Celui qui REVIENT : la nuit pourra le reposer devant vous sans
                que ça se répète. Si aucun ne revient, laissez la ligne vide.
              </span>
            </label>
          </div>

          <div class="relative h-px bg-neon-600/25" />

          <div class="relative flex items-center justify-between gap-4">
            <button
              class="font-display text-[10px] uppercase tracking-[0.28em] text-steel-400
                     hover:text-ink-200 transition-colors py-2"
              @click="step === 0 ? cancel() : back()"
            >
              {{ step === 0 ? 'Retour' : 'Précédent' }}
            </button>
            <GlowButton :disabled="!canAdvance" @click="next">
              {{ step === STEPS.length - 1 ? 'Déposer le dossier' : 'Suivant' }}
            </GlowButton>
          </div>

          <p v-if="step === 0 && !canAdvance" class="relative field-hint text-center">
            Prénom et date de naissance sont exigés. Le reste, non.
          </p>
        </div>
      </template>

      <!-- ================= LA RÉPONSE DE LA COMMISSION ================= -->
      <!--
        Écrit en dur, et pour de bon : ce moment doit tomber à l'identique pour
        tout le monde, arriver sans attente et ne rien coûter. Rien ici ne part
        au modèle — la première génération, c'est la scène d'après.
      -->
      <template v-else>
        <div class="text-center space-y-3 mb-8">
          <p class="text-steel-400 text-[10px] uppercase tracking-[0.4em] font-display">
            Commission de nuit — dossier n° {{ fileNumber }}
          </p>
          <h1 class="neon-text animate-neon-buzz font-display uppercase text-[2.4rem] tracking-[0.1em] leading-none">
            Admis
          </h1>
          <div class="neon-rule w-28 mx-auto" />
        </div>

        <div class="dossier relative bg-ink-900/85 border border-neon-600/40 p-6 sm:p-7 space-y-6">
          <span class="absolute inset-[5px] border border-neon-500/12 pointer-events-none" />

          <div class="relative grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
            <span class="field-label pt-0.5">Nom</span>
            <span class="text-ink-100 text-[13px]">{{ displayName }}</span>
            <span class="field-label pt-0.5">Domicile</span>
            <span class="text-ink-100 text-[13px]">{{ displayCity }}</span>
            <span class="field-label pt-0.5">Statut</span>
            <span class="text-neon-400 text-[13px] font-display uppercase tracking-[0.2em]">Retenu</span>
            <span class="field-label pt-0.5">Validité</span>
            <span class="text-ink-100 text-[13px]">Une nuit, jusqu'au lever du jour</span>
          </div>

          <div class="relative h-px bg-neon-600/25" />

          <div class="relative space-y-4 text-ink-200/85 text-[13px] leading-relaxed">
            <p>
              Votre dossier est passé devant la commission de nuit. Onze mille
              candidatures cette semaine ; quatorze retenues. La vôtre en fait
              partie.
            </p>
            <p>
              Ce n'est pas le hasard : la ville ne laisse entrer que ceux dont
              le nom sonne juste. Le vôtre a été pesé, vérifié, accepté. Ce que
              vous avez déclaré ici, la nuit s'en servira — vos villes, vos
              attaches, ce que vous avez quitté, et l'emploi de vos nuits.
            </p>
            <p>
              <strong class="text-ink-100 font-normal">Un droit de passage temporaire vous est accordé.</strong>
              Présentez-vous à l'auberge du Bout du Monde. On vous y attend
              déjà, et la pluie ne va pas s'arrêter.
            </p>
          </div>

          <div class="relative h-px bg-neon-600/25" />

          <div class="relative flex flex-col items-center gap-4">
            <GlowButton class="w-full" @click="enterCity">Entrer dans la nuit</GlowButton>
            <button
              class="font-display text-[10px] uppercase tracking-[0.28em] text-steel-400
                     hover:text-ink-200 transition-colors"
              @click="phase = 'form'"
            >
              Corriger le dossier
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Balayage cathodique, comme partout ailleurs -->
    <div class="crt-scanlines fixed inset-0 z-20 pointer-events-none opacity-40" />
  </div>
</template>

<style scoped>
/*
  Le dossier : un rectangle net posé sur la nuit, jamais une carte arrondie.
  L'ombre porte loin pour le décoller du fond, le liseré néon reste fin.
*/
.dossier {
  box-shadow: 0 0 0 1px rgb(var(--neon-500) / 0.1), 0 24px 60px rgba(0, 0, 0, 0.8);
}

/* Les intitulés du bureau : capitales géométriques, très espacées. */
.field-label {
  display: block;
  font-family: Futura, 'Avenir Next', 'Century Gothic', 'Trebuchet MS', system-ui, sans-serif;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: rgb(var(--steel-400));
}

.field-hint {
  display: block;
  font-size: 10px;
  line-height: 1.6;
  color: rgb(var(--steel-500));
}

/*
  Un champ administratif : une ligne à remplir, pas une boîte. Seul le filet du
  bas dit où écrire — et il s'allume au néon quand le curseur y est.
*/
.field {
  width: 100%;
  background: rgb(var(--ink-800) / 0.5);
  border: 0;
  border-bottom: 1px solid rgb(var(--steel-600));
  padding: 0.5rem 0.75rem;
  color: rgb(var(--ink-100));
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.field::placeholder {
  color: rgb(var(--steel-500));
}

.field:focus {
  border-bottom-color: rgb(var(--neon-500));
  background: rgb(var(--ink-800));
}

/*
  Deux champs respirent sur plusieurs lignes — les nuits et le rêve. Le
  navigateur donne au textarea sa propre police et sa propre taille : on les
  ramène à celles du dossier, et on interdit la poignée de redimensionnement,
  qui casserait l'alignement du formulaire.
*/
.field-multi {
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  display: block;
}

/* Le calendrier natif est blanc sur blanc en thème sombre : on l'inverse. */
.field::-webkit-calendar-picker-indicator {
  filter: invert(1) opacity(0.45);
  cursor: pointer;
}

/* Une pastille anguleuse, cochée au néon plein. */
.chip {
  font-family: Futura, 'Avenir Next', 'Century Gothic', 'Trebuchet MS', system-ui, sans-serif;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgb(var(--steel-600));
  color: rgb(var(--ink-300));
  background: rgb(var(--ink-800) / 0.4);
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.chip:hover {
  border-color: rgb(var(--neon-600) / 0.6);
  color: rgb(var(--ink-100));
}

.chip-on {
  border-color: rgb(var(--neon-500));
  background: rgb(var(--neon-500) / 0.15);
  color: rgb(var(--neon-200));
}
</style>
