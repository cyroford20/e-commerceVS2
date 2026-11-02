<template>
  <ion-page>
    <Navbar title="Login" :show-cart="false" :show-orders="false" />

    <ion-content :fullscreen="true">
      <div class="auth-stage">
        <aside class="auth-visual" aria-hidden="true">
          <div class="visual-photo"></div>
          <div class="orb orb-a"></div>
          <div class="orb orb-b"></div>
          <div class="veil"></div>
          <div class="visual-copy">
            <p class="visual-brand"><img src="/logo.svg" alt="VapeShop" /></p>
            <p class="visual-line">Sign in. Stay sharp.</p>
          </div>
        </aside>

        <div class="auth-panel rise-in">
          <p class="eyebrow">Welcome back</p>
          <h1>Sign in</h1>
          <p class="subtitle">Pick up where you left your cart.</p>

          <div class="field-stack">
            <label>
              Email
              <ion-input type="email" v-model="email" placeholder="you@example.com" fill="outline"></ion-input>
            </label>
            <label>
              Password
              <ion-input type="password" v-model="password" placeholder="Your password" fill="outline"></ion-input>
            </label>
          </div>

          <ion-button expand="block" :disabled="loading" @click="handleLogin">
            {{ loading ? 'Signing in...' : 'Login' }}
          </ion-button>

          <p class="switch-link">
            Don't have an account?
            <router-link to="/register">Register</router-link>
          </p>

          <p class="error-msg" v-if="error">{{ error }}</p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonInput, IonButton } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import { loginUser, saveAuth, homeForRole } from '../services/api';

const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const handleLogin = async () => {
  error.value = '';

  if (!email.value || !password.value) {
    error.value = 'Please enter email and password.';
    return;
  }

  loading.value = true;
  try {
    const res = await loginUser(email.value, password.value);
    saveAuth(res.data.token, res.data.user);
    router.push(homeForRole(res.data.user.role));
  } catch (err) {
    error.value = err.response?.data?.message || 'Login failed. Please try again.';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.auth-stage {
  min-height: calc(100dvh - 62px);
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
}

.auth-visual {
  position: relative;
  overflow: hidden;
  background: #050505;
}

.visual-photo {
  position: absolute;
  inset: -12%;
  background:
    radial-gradient(circle at 28% 28%, rgba(255, 77, 141, 0.55), transparent 38%),
    radial-gradient(circle at 78% 72%, rgba(255, 255, 255, 0.1), transparent 30%),
    linear-gradient(160deg, #1a0a12, #050505 55%, #140810);
  animation: drift 22s ease-in-out infinite;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(30px);
  animation: soft-pulse 6s ease-in-out infinite;
}

.orb-a {
  width: 220px;
  height: 220px;
  right: 12%;
  top: 18%;
  background: rgba(255, 77, 141, 0.35);
}

.orb-b {
  width: 160px;
  height: 160px;
  left: 14%;
  bottom: 20%;
  background: rgba(255, 255, 255, 0.12);
  animation-delay: 1.2s;
}

.veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, rgba(5, 5, 5, 0.05), rgba(5, 5, 5, 0.62));
}

.visual-copy {
  position: absolute;
  left: 1.5rem;
  right: 1.5rem;
  bottom: 1.6rem;
  z-index: 1;
}

.visual-brand {
  display: flex;
  align-items: center;
  gap: 0.35em;
  margin: 0 0 0.4rem;
  font-family: 'Syne', sans-serif;
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #ffffff;
}

.visual-brand img {
  width: clamp(12rem, 22vw, 20rem);
  height: auto;
  box-shadow: 0 0 20px rgba(255, 77, 141, 0.45);
}

.visual-brand span {
  color: #ff4d8d;
}

.visual-line {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.04em;
}

.auth-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2.6rem 2rem;
  background:
    radial-gradient(ellipse 80% 45% at 100% 0%, rgba(255, 77, 141, 0.1), transparent 55%),
    #ffffff;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: #ff4d8d;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 0.4rem;
  font-size: clamp(2.1rem, 4vw, 2.8rem);
}

.subtitle {
  margin: 0 0 1.8rem;
  color: #5c5c5c;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.3rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #444;
}

ion-input {
  --background: #fffafc;
  --border-color: #f3d6e3;
  --border-radius: 16px;
  --padding-start: 0.95rem;
  --padding-end: 0.95rem;
  --highlight-color-focused: #ff4d8d;
  min-height: 50px;
}

ion-button {
  --background: #050505;
  --background-hover: #ff4d8d;
  --background-activated: #d4146a;
  height: 50px;
}

.switch-link {
  text-align: center;
  margin-top: 1.45rem;
  color: #5c5c5c;
}

.error-msg {
  text-align: center;
  margin-top: 1rem;
  color: #d4146a;
  font-weight: 650;
}

@media (max-width: 860px) {
  .auth-stage {
    grid-template-columns: 1fr;
  }

  .auth-visual {
    min-height: 30vh;
  }

  .auth-panel {
    padding: 2rem 1.25rem 3rem;
  }
}
</style>
