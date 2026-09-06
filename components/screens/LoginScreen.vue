<script setup lang="ts">
import { useFacebook } from '~/composables/useFacebook'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import type { UserProfile } from '~/types/user'

const { login, isLoading, error } = useFacebook()
const gameStore = useGameStore()
const playerStore = usePlayerStore()

const showDisclaimer = ref(false)
const isLoadingDemo = ref(false)

/**
 * Averse de mégapole. Les valeurs sont dérivées de l'index, jamais tirées au
 * hasard : un Math.random() donnerait un rendu serveur différent du rendu
 * client et Vue signalerait une incohérence d'hydratation.
 */
const raindrops = Array.from({ length: 44 }, (_, i) => ({
  left: (i * 37) % 100,
  height: 30 + (i * 11) % 70,
  delay: ((i * 13) % 22) / 10,
  duration: 0.7 + ((i * 7) % 7) / 10,
  opacity: 0.18 + ((i * 5) % 5) / 20,
}))

/** Lance la scène sur le profil de démonstration, sans passer par Meta. */
async function startWithoutMeta() {
  isLoadingDemo.value = true
  try {
    const profile = await $fetch<UserProfile>('/api/user/demo')
    playerStore.setProfile(profile)
  } catch {
    // Le serveur retombera de toute façon sur game/user.json.
  } finally {
    isLoadingDemo.value = false
    gameStore.setScreen('scene_build_loading')
  }
}

function openDisclaimer() {
  showDisclaimer.value = true
}

async function acceptAndLogin() {
  showDisclaimer.value = false
  await login()
}
</script>

<template>
  <div class="relative min-h-[100dvh] overflow-hidden flex flex-col items-center justify-center px-6 text-center">
    <!-- Lueur de la ville, sous l'horizon -->
    <div
      class="absolute inset-x-0 bottom-0 h-[55vh] pointer-events-none"
      style="background: radial-gradient(90% 100% at 50% 100%, rgb(var(--neon-500) / 0.22) 0%, rgb(var(--neon-500) / 0.06) 38%, transparent 70%)"
    />

    <!--
      Skyline Art Déco à gradins, silhouette plate sur deux plans, tubes néon
      sur les façades. C'est le décor polygonal de Flashback, pas un dégradé.
    -->
    <div class="absolute inset-x-0 bottom-0 pointer-events-none opacity-90">
      <svg viewBox="0 0 2400 460" preserveAspectRatio="xMidYMax meet" class="w-full h-auto" aria-hidden="true">
        <g fill="#1c2537"><rect x="40" y="310" width="86" height="150"/><rect x="52" y="277" width="62" height="183"/><rect x="64" y="244" width="38" height="216"/><rect x="170" y="350" width="58" height="110"/><rect x="178" y="326" width="42" height="134"/><rect x="255" y="270" width="104" height="190"/><rect x="269" y="229" width="76" height="231"/><rect x="283" y="188" width="48" height="272"/><rect x="400" y="330" width="66" height="130"/><rect x="409" y="302" width="48" height="158"/><rect x="500" y="235" width="120" height="225"/><rect x="517" y="186" width="86" height="274"/><rect x="534" y="137" width="52" height="323"/><rect x="551" y="88" width="18" height="372"/><rect x="668" y="315" width="74" height="145"/><rect x="678" y="284" width="54" height="176"/><rect x="688" y="253" width="34" height="207"/><rect x="775" y="285" width="96" height="175"/><rect x="788" y="247" width="70" height="213"/><rect x="801" y="209" width="44" height="251"/><rect x="905" y="340" width="58" height="120"/><rect x="913" y="314" width="42" height="146"/><rect x="1000" y="220" width="128" height="240"/><rect x="1018" y="168" width="92" height="292"/><rect x="1036" y="116" width="56" height="344"/><rect x="1054" y="64" width="20" height="396"/><rect x="1180" y="325" width="70" height="135"/><rect x="1190" y="296" width="50" height="164"/><rect x="1285" y="275" width="92" height="185"/><rect x="1298" y="235" width="66" height="225"/><rect x="1311" y="195" width="40" height="265"/><rect x="1420" y="345" width="60" height="115"/><rect x="1428" y="320" width="44" height="140"/><rect x="1510" y="245" width="116" height="215"/><rect x="1526" y="198" width="84" height="262"/><rect x="1542" y="151" width="52" height="309"/><rect x="1558" y="104" width="20" height="356"/><rect x="1680" y="310" width="78" height="150"/><rect x="1691" y="277" width="56" height="183"/><rect x="1702" y="244" width="34" height="216"/><rect x="1795" y="335" width="64" height="125"/><rect x="1804" y="308" width="46" height="152"/><rect x="1885" y="260" width="108" height="200"/><rect x="1900" y="216" width="78" height="244"/><rect x="1915" y="172" width="48" height="288"/><rect x="1930" y="128" width="18" height="332"/><rect x="2050" y="320" width="72" height="140"/><rect x="2060" y="290" width="52" height="170"/><rect x="2070" y="260" width="32" height="200"/><rect x="2160" y="290" width="90" height="170"/><rect x="2172" y="253" width="66" height="207"/><rect x="2184" y="216" width="42" height="244"/><rect x="2290" y="330" width="70" height="130"/><rect x="2300" y="302" width="50" height="158"/><rect x="548" y="60" width="7" height="400"/><rect x="1962" y="105" width="7" height="355"/></g>
        <g fill="#0f1626"><rect x="0" y="270" width="96" height="190"/><rect x="13" y="229" width="70" height="231"/><rect x="26" y="188" width="44" height="272"/><rect x="120" y="320" width="68" height="140"/><rect x="129" y="290" width="50" height="170"/><rect x="560" y="205" width="112" height="255"/><rect x="576" y="149" width="80" height="311"/><rect x="592" y="93" width="48" height="367"/><rect x="608" y="37" width="16" height="423"/><rect x="720" y="285" width="80" height="175"/><rect x="731" y="247" width="58" height="213"/><rect x="742" y="209" width="36" height="251"/><rect x="1090" y="170" width="132" height="290"/><rect x="1108" y="107" width="96" height="353"/><rect x="1126" y="44" width="60" height="416"/><rect x="1144" y="-19" width="24" height="479"/><rect x="1270" y="300" width="74" height="160"/><rect x="1280" y="265" width="54" height="195"/><rect x="1620" y="225" width="104" height="235"/><rect x="1634" y="174" width="76" height="286"/><rect x="1648" y="123" width="48" height="337"/><rect x="1662" y="72" width="20" height="388"/><rect x="1770" y="315" width="66" height="145"/><rect x="1779" y="284" width="48" height="176"/><rect x="2110" y="195" width="120" height="265"/><rect x="2127" y="137" width="86" height="323"/><rect x="2144" y="79" width="52" height="381"/><rect x="2161" y="21" width="18" height="439"/><rect x="2300" y="255" width="100" height="205"/><rect x="2314" y="210" width="72" height="250"/><rect x="2328" y="165" width="44" height="295"/><rect x="1150" y="80" width="9" height="380"/><rect x="2168" y="55" width="7" height="405"/></g>
        <g fill="rgb(var(--neon-500))" opacity="0.9"><rect x="48" y="328" width="70" height="3"/><rect x="263" y="288" width="88" height="3"/><rect x="508" y="253" width="104" height="3"/><rect x="783" y="303" width="80" height="3"/><rect x="1008" y="238" width="112" height="3"/><rect x="1293" y="293" width="76" height="3"/><rect x="1518" y="263" width="100" height="3"/><rect x="1803" y="353" width="48" height="3"/><rect x="2058" y="338" width="56" height="3"/><rect x="2298" y="348" width="54" height="3"/><rect x="10" y="296" width="76" height="4"/><rect x="28" y="230" width="38" height="3"/><rect x="570" y="231" width="92" height="4"/><rect x="593" y="165" width="44" height="3"/><rect x="1100" y="196" width="112" height="4"/><rect x="1129" y="130" width="52" height="3"/><rect x="1630" y="251" width="84" height="4"/><rect x="1651" y="185" width="41" height="3"/><rect x="2120" y="221" width="100" height="4"/><rect x="2146" y="155" width="48" height="3"/><rect x="1148" y="86" width="13" height="52"/><rect x="546" y="64" width="11" height="40"/></g>
      </svg>
    </div>

    <!-- Pluie -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <span
        v-for="(drop, i) in raindrops"
        :key="i"
        class="rain-drop animate-rain-fall"
        :style="{
          left: `${drop.left}%`,
          height: `${drop.height}px`,
          animationDelay: `${drop.delay}s`,
          animationDuration: `${drop.duration}s`,
          opacity: drop.opacity,
        }"
      />
    </div>

    <!-- Voile : le texte doit rester lisible par-dessus les tours -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background: radial-gradient(58% 54% at 50% 45%, rgba(8,11,18,0.94) 0%, rgba(8,11,18,0.78) 48%, transparent 80%)"
    />

    <!-- Contenu -->
    <div class="relative z-10 flex flex-col items-center gap-8 max-w-md w-full">
      <!-- Ziggourat néon : gradins symétriques, la signature Deco -->
      <svg viewBox="0 0 52 22" class="w-14 h-6 fill-neon-500 animate-neon-buzz" aria-hidden="true"
           style="filter: drop-shadow(0 0 6px rgb(var(--neon-500) / 0.85))">
        <rect x="0" y="16" width="4" height="6" />
        <rect x="6" y="12" width="4" height="10" />
        <rect x="12" y="8" width="4" height="14" />
        <rect x="18" y="4" width="4" height="18" />
        <rect x="24" y="0" width="4" height="22" />
        <rect x="30" y="4" width="4" height="18" />
        <rect x="36" y="8" width="4" height="14" />
        <rect x="42" y="12" width="4" height="10" />
        <rect x="48" y="16" width="4" height="6" />
      </svg>

      <div class="w-full space-y-5">
        <p class="text-steel-400 text-[10px] uppercase tracking-[0.45em] font-display">
          Un jeu de rôle textuel
        </p>

        <h1 class="neon-text animate-neon-buzz font-display uppercase leading-[0.95] tracking-[0.05em] text-[2.1rem] sm:text-[2.9rem]">
          La Nuit du<br>Bout du Monde
        </h1>

        <div class="neon-rule w-40 mx-auto" />
      </div>

      <!--
        L'accroche tient en une phrase et pose les deux promesses du jeu : le
        monde est bâti sur ce joueur-là, et ce qu'il y dénoue lui revient. La
        coupure tombe avant « vers » : ce que c'est d'un côté, où ça mène de
        l'autre.
      -->
      <p class="text-ink-200/75 text-sm leading-relaxed max-w-xs">
        Une aventure personnalisée<br>
        vers une résolution qui vous appartient.
      </p>

      <div class="w-full space-y-4 flex flex-col items-center">
        <GlowButton :loading="isLoading" @click="openDisclaimer">
          <span class="flex items-center gap-2.5">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Commencer avec Meta
          </span>
        </GlowButton>
        <p class="text-steel-400 text-[10px] uppercase tracking-[0.2em] font-display">
          Connexion sécurisée via Facebook / Instagram
        </p>
      </div>

      <button
        class="font-display text-[10px] uppercase tracking-[0.28em] text-ink-300 hover:text-neon-400
               border-b border-steel-600 hover:border-neon-600 pb-1
               transition-colors disabled:opacity-40 py-2 px-1"
        :disabled="isLoadingDemo"
        @click="startWithoutMeta"
      >
        {{ isLoadingDemo ? 'Ouverture du sas' : 'Lancer sans les données Meta' }}
      </button>

      <p v-if="error" class="text-red-400/80 text-sm">{{ error }}</p>
    </div>

    <!-- Balayage cathodique, tout au-dessus -->
    <div class="crt-scanlines absolute inset-0 z-20 pointer-events-none opacity-45" />

    <!-- Avertissement données -->
    <Transition name="modal">
      <div
        v-if="showDisclaimer"
        class="fixed inset-0 z-50 flex items-center justify-center px-6"
        @click.self="showDisclaimer = false"
      >
        <div class="absolute inset-0 bg-ink-900/92" />

        <div class="relative z-10 w-full max-w-sm bg-ink-900 border border-neon-600/50 p-7 space-y-7"
             style="box-shadow: 0 0 0 1px rgb(var(--neon-500) / 0.12), 0 24px 60px rgba(0,0,0,0.8), 0 0 40px rgb(var(--neon-500) / 0.12)">
          <span class="absolute inset-[5px] border border-neon-500/15 pointer-events-none" />

          <div class="space-y-3 text-center">
            <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.35em] font-display">
              Avant de commencer
            </p>
            <h2 class="font-display uppercase text-ink-100 text-lg tracking-[0.08em]">
              Vos données, votre histoire
            </h2>
            <div class="neon-rule w-24 mx-auto" />
          </div>

          <ul class="space-y-5 text-left">
            <li
              v-for="(point, i) in [
                'Vos informations Facebook servent uniquement à générer votre aventure personnalisée — personnages, lieux, quête.',
                'Nous ne stockons, ne partageons et ne revendons aucune de vos données.',
                'Tout est traité en temps réel et oublié dès la fermeture de la session.',
              ]"
              :key="i"
              class="flex items-start gap-3.5"
            >
              <!-- Chevron angulaire, pas un losange de grimoire -->
              <svg viewBox="0 0 8 10" class="w-2 h-2.5 mt-1 shrink-0 fill-neon-500" aria-hidden="true">
                <path d="M0 0 L5 5 L0 10 L3 10 L8 5 L3 0 Z" />
              </svg>
              <span class="text-ink-200/80 text-[13px] leading-relaxed">{{ point }}</span>
            </li>
          </ul>

          <div class="h-px bg-neon-600/30" />

          <div class="space-y-4 flex flex-col items-center">
            <GlowButton class="w-full" @click="acceptAndLogin">Continuer</GlowButton>
            <button
              class="font-display text-[10px] uppercase tracking-[0.28em] text-steel-400 hover:text-ink-200 transition-colors"
              @click="showDisclaimer = false"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.25s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
