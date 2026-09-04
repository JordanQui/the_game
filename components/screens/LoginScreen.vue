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
  <div class="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
    <!-- Background vignette -->
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(92,64,28,0.08)_0%,rgba(13,10,7,1)_70%)] pointer-events-none" />

    <div class="relative z-10 flex flex-col items-center gap-8 max-w-md">
      <!-- Title -->
      <div class="space-y-3">
        <p class="text-amber-700/60 text-xs uppercase tracking-[0.3em] font-sans">Un jeu de rôle textuel</p>
        <h1 class="text-4xl sm:text-5xl font-serif text-amber-300 text-glow leading-tight">
          L'Auberge du<br/>Bout du Monde
        </h1>
        <div class="w-24 h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent mx-auto" />
      </div>

      <!-- Description -->
      <p class="text-parchment/60 text-sm leading-relaxed font-serif italic">
        Une aventure forgée à partir de votre histoire.<br/>
        Votre vie réelle, sublimée en légende.
      </p>

      <!-- Login button -->
      <div class="space-y-3">
        <GlowButton :loading="isLoading" @click="openDisclaimer">
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Commencer l'aventure avec Meta
          </span>
        </GlowButton>
        <p class="text-ink-500 text-xs">Connexion sécurisée via Facebook / Instagram</p>
      </div>

      <!-- Essai sans Meta -->
      <button
        class="text-ink-400 text-xs underline underline-offset-4 decoration-ink-600 hover:text-amber-400/80 hover:decoration-amber-700 transition-colors disabled:opacity-40 py-2 px-3 -my-2"
        :disabled="isLoadingDemo"
        @click="startWithoutMeta"
      >
        {{ isLoadingDemo ? 'Ouverture de la porte...' : 'Lancer sans les données Meta' }}
      </button>

      <!-- Error -->
      <p v-if="error" class="text-red-400/80 text-sm">{{ error }}</p>
    </div>

    <!-- Disclaimer modal -->
    <Transition name="modal">
      <div
        v-if="showDisclaimer"
        class="fixed inset-0 z-50 flex items-center justify-center px-6"
        @click.self="showDisclaimer = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-ink-900/85 backdrop-blur-sm" />

        <!-- Panel -->
        <div class="relative z-10 w-full max-w-sm panel-ancient p-6 space-y-6">
          <!-- Header -->
          <div class="space-y-1 text-center">
            <p class="text-amber-500/80 text-xs uppercase tracking-widest font-sans">Avant de commencer</p>
            <h2 class="text-amber-300 font-serif text-xl">Vos données, votre histoire</h2>
            <div class="w-16 h-px bg-gradient-to-r from-transparent via-amber-800/60 to-transparent mx-auto pt-1" />
          </div>

          <!-- Points -->
          <ul class="space-y-4 text-sm text-left">
            <li class="flex items-start gap-3">
              <span class="text-amber-600 mt-0.5 shrink-0 text-base">◆</span>
              <span class="text-parchment/75 leading-relaxed">
                Vos informations Facebook servent <strong class="text-parchment">uniquement à générer votre aventure</strong> personnalisée — personnages, lieux, quête.
              </span>
            </li>
            <li class="flex items-start gap-3">
              <span class="text-amber-600 mt-0.5 shrink-0 text-base">◆</span>
              <span class="text-parchment/75 leading-relaxed">
                Nous ne stockons, ne partageons et <strong class="text-parchment">ne revendons aucune de vos données</strong>.
              </span>
            </li>
            <li class="flex items-start gap-3">
              <span class="text-amber-600 mt-0.5 shrink-0 text-base">◆</span>
              <span class="text-parchment/75 leading-relaxed">
                Tout est traité en temps réel et <strong class="text-parchment">oublié dès la fermeture</strong> de la session.
              </span>
            </li>
          </ul>

          <!-- Divider -->
          <div class="w-full h-px bg-amber-900/40" />

          <!-- CTA -->
          <div class="space-y-3 text-center">
            <GlowButton class="w-full" @click="acceptAndLogin">
              Continuer
            </GlowButton>
            <button
              class="text-ink-400 text-xs hover:text-parchment/50 transition-colors"
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
