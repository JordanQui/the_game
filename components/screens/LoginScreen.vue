<script setup lang="ts">
import { useFacebook } from '~/composables/useFacebook'

const { login, isLoading, error } = useFacebook()
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
        <GlowButton :loading="isLoading" @click="login">
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Commencer l'aventure
          </span>
        </GlowButton>
        <p class="text-ink-400 text-xs">
          Connexion via Facebook pour personnaliser votre quête
        </p>
      </div>

      <!-- Error -->
      <p v-if="error" class="text-red-400/80 text-sm">{{ error }}</p>
    </div>
  </div>
</template>
