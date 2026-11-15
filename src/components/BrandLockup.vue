<template>
  <div class="brand-lockup" :class="`brand-lockup--${size}`" role="img" aria-label="Black Elite Vape Store">
    <img class="brand-lockup__icon" src="/black-elite-logo.png" alt="" />
    <span class="brand-lockup__name">
      <strong>BLACK ELITE</strong>
      <small>VAPE STORE</small>
    </span>
  </div>
</template>

<script setup>
defineProps({
  size: { type: String, default: 'compact', validator: (value) => ['compact', 'hero', 'auth'].includes(value) },
});
</script>

<style scoped>
.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: .55rem;
  color: #fff;
  text-align: left;
  line-height: 1;
  white-space: nowrap;
}

.brand-lockup__icon {
  display: block;
  width: 3rem;
  height: 3rem;
  flex: 0 0 auto;
  object-fit: cover;
  border-radius: .5rem;
}

.brand-lockup__name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: .32rem;
}

.brand-lockup__name strong {
  color: #fff;
  font-family: 'Syne', Arial, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: .075em;
  line-height: 1;
}

.brand-lockup__name small {
  color: #dedde5;
  font-family: 'Outfit', Arial, sans-serif;
  font-size: .52rem;
  font-weight: 700;
  letter-spacing: .34em;
  line-height: 1;
}

.brand-lockup--hero { gap: .8rem; }
.brand-lockup--hero .brand-lockup__icon { width: 6.1rem; height: 6.1rem; border-radius: .8rem; }
.brand-lockup--hero .brand-lockup__name { gap: .58rem; }
.brand-lockup--hero .brand-lockup__name strong { font-size: clamp(1.45rem, 4vw, 2rem); }
.brand-lockup--hero .brand-lockup__name small { font-size: .72rem; letter-spacing: .42em; }

.brand-lockup--auth { gap: .7rem; }
.brand-lockup--auth .brand-lockup__icon { width: 5.2rem; height: 5.2rem; border-radius: .72rem; }
.brand-lockup--auth .brand-lockup__name strong { font-size: clamp(1.1rem, 2.4vw, 1.55rem); }
.brand-lockup--auth .brand-lockup__name small { font-size: .62rem; letter-spacing: .38em; }

@media (max-width: 390px) {
  .brand-lockup--hero .brand-lockup__icon { width: 5.2rem; height: 5.2rem; }
  .brand-lockup--hero .brand-lockup__name strong { font-size: 1.4rem; }
}
</style>
