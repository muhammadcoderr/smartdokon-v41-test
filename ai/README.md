# SmartDokon Backend AI

Bu papka tashqi API yoki token ishlatmasdan ishlaydigan ichki analitika modullarini saqlaydi.

## Hozirgi modul

- `autopilot/`
  - `dataProvider.js`: MongoDB dan kerakli ma'lumotlarni yig'adi
  - `analysisEngine.js`: qoidaviy tahlil, risk flag va tavsiyalarni hisoblaydi
  - `utils.js`: umumiy yordamchi funksiyalar
  - `index.js`: route lar uchun servis entry point

## Ishlash prinsipi

1. Route backend ichida `generateAutopilotInsights()` ni chaqiradi.
2. Modul `Payment`, `Product`, `Costs`, `Client` kolleksiyalaridan ma'lumot oladi.
3. Tizim LLMsiz, tokensiz va lokal qoidalar asosida:
   - tushum va foyda
   - xarajat bosimi
   - qarz bosimi
   - top mahsulotlar
   - sekin aylanayotgan mahsulotlar
   - foydali mijozlar
   - undirish tavsiyalari
   ni hisoblaydi.

## API

- `GET /dashboard/autopilot-insights`
- ixtiyoriy query: `windowDays=30`

`windowDays` 7 dan 120 kungacha cheklanadi.

## Kengaytirish

Yangi AI modul qo'shmoqchi bo'lsangiz, shu papka ichida alohida subfolder ochib:

1. `dataProvider`
2. `analysisEngine`
3. `index`

strukturasi bilan qo'shish tavsiya qilinadi.
