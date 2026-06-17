const monthNames = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

const roadmapTemplate = [
  {
    stage: "Asosni mustahkamlash",
    goal: "Savdo, xarajat va qarz ma'lumotlarini tozalab yagona standartga keltirish.",
    actions: [
      "Noto'g'ri mahsulot nomlari va kategoriyalarni birxillashtiring.",
      "Qarz yozuvlari uchun majburiy izoh va muddat qoidasini kiriting.",
      "Har kun yakunida POS va kassa mosligini tekshiring.",
    ],
    kpi: "Data tozaligi va kunlik hisobot intizomi",
  },
  {
    stage: "Xarajat intizomi",
    goal: "Xarajatlarni kategoriya bo'yicha boshqarib foyda oqimini himoyalash.",
    actions: [
      "Har kategoriya uchun haftalik limit belgilang.",
      "Limitdan oshgan xarajatlar uchun tasdiqlash oqimi joriy qiling.",
      "Qaytarib bo'ladigan xarajatlarni alohida ro'yxatga ajrating.",
    ],
    kpi: "Xarajat/tushum nisbati",
  },
  {
    stage: "Assortiment optimizatsiyasi",
    goal: "Foydali mahsulotlarga fokusni oshirib sekin aylanayotganlarni kamaytirish.",
    actions: [
      "Top foyda berayotgan mahsulotlarni old vitrinaga chiqaring.",
      "Sekin aylanayotgan mahsulotlarga bundle yoki chegirma sinovi qiling.",
      "Har kategoriya uchun minimal zaxira me'yorini qayta ko'rib chiqing.",
    ],
    kpi: "Top mahsulot foydasi va zaxira aylanish tezligi",
  },
  {
    stage: "Mijoz segmentatsiyasi",
    goal: "Mijozlarni qiymatiga qarab boshqarib qayta xaridni oshirish.",
    actions: [
      "Top mijozlar uchun bonus yoki tezkor takliflar oching.",
      "Uzoq vaqtdan beri xarid qilmaganlar uchun qayta aktivatsiya kampaniyasi qiling.",
      "Qarzli mijozlarni risk bo'yicha 3 segmentga ajrating.",
    ],
    kpi: "Qayta xarid ulushi",
  },
  {
    stage: "Qarzlarni qisqartirish",
    goal: "Qarz bosimini tushirib pul oqimini kuchaytirish.",
    actions: [
      "30 kundan oshgan qarzlar uchun zudlik bilan undirish sprinti qiling.",
      "Yangi qarz savdolarida minimal oldindan to'lov foizini belgilang.",
      "Qarz qaytarish jadvalini har hafta monitoring qiling.",
    ],
    kpi: "Qarz/tushum nisbati",
  },
  {
    stage: "Jamoa samaradorligi",
    goal: "Sotuvchi va admin ishlash standartini bir xil yuqori darajaga olib chiqish.",
    actions: [
      "Har foydalanuvchi uchun oylik sotuv va foyda maqsadini qo'ying.",
      "Sust natija ko'rsatganlar uchun qisqa coaching sprintini yoqing.",
      "Eng yaxshi amaliyotni jamoa ichida standartga aylantiring.",
    ],
    kpi: "Foydalanuvchi kesimida foyda samaradorligi",
  },
  {
    stage: "Yozgi talab strategiyasi",
    goal: "Mavsumiy talabdan maksimal foyda olish.",
    actions: [
      "Mavsumiy bestseller ro'yxatini oldindan tayyorlang.",
      "Tez tugaydigan mahsulotlar uchun qayta buyurtma triggeri yarating.",
      "Mavsumiy reklama va vitrina joylashuvini optimallashtiring.",
    ],
    kpi: "Mavsumiy tushum o'sishi",
  },
  {
    stage: "Operatsion tezlik",
    goal: "Har kuni qaror qabul qilish tezligini oshirish.",
    actions: [
      "Daily action plan bo'yicha 15 daqiqalik ertalabki yig'ilish o'tkazing.",
      "Anomaliya signaliga javob berish SLA belgilang.",
      "Top 3 risk va top 3 imkoniyatni har hafta qayta baholang.",
    ],
    kpi: "Anomaliyaga javob berish vaqti",
  },
  {
    stage: "Mablag'ni qayta taqsimlash",
    goal: "Kuchli yo'nalishlarga ko'proq budjet ajratish.",
    actions: [
      "Past rentabelli xarajatlarni qisqartirib marketing yoki zaxiraga yo'naltiring.",
      "Top mahsulot va top mijoz segmentiga investitsiya ulushini oshiring.",
      "Kutilmagan xarajatlar uchun xavfsizlik fondi yarating.",
    ],
    kpi: "Net foyda marjasi",
  },
  {
    stage: "Yil yakuni tayyorgarligi",
    goal: "Yuqori savdo davriga tizimli tayyorgarlik ko'rish.",
    actions: [
      "Tugash xavfidagi mahsulotlar bo'yicha oldindan buyurtma qiling.",
      "Kassa va ombor sig'imini yuqori oqimga moslang.",
      "Promo-kampaniya kalendarini aniq muddatlar bilan yakunlang.",
    ],
    kpi: "Peak davr xizmat sifati va stock mavjudligi",
  },
  {
    stage: "Foyda qulfi",
    goal: "Qisqa muddatda foyda ko'rsatkichini maksimal darajada ushlab qolish.",
    actions: [
      "Chegirma siyosatini faqat yuqori aylanishli tovarlar bilan cheklang.",
      "Qarzga savdo limitlarini vaqtincha qat'iylashtiring.",
      "Har 3 kunda sof foyda trendini qayta tekshiring.",
    ],
    kpi: "Sof foyda trendi",
  },
  {
    stage: "Yillik audit va yangi sikl",
    goal: "Yil natijasini baholab keyingi yil uchun real roadmap tuzish.",
    actions: [
      "12 oy KPI natijalarini jamlab muvaffaqiyat va xatolarni ajrating.",
      "Kelasi yil uchun 3 asosiy strategik maqsadni tasdiqlang.",
      "Roadmapni yangi yil uchun yangilangan ma'lumot bilan qayta yarating.",
    ],
    kpi: "Yillik strategik maqsad bajarilish foizi",
  },
];

const resolveStatus = (monthIndex, currentMonthIndex, year, currentYear) => {
  if (year < currentYear) return "completed";
  if (year > currentYear) return "upcoming";
  if (monthIndex < currentMonthIndex) return "completed";
  if (monthIndex === currentMonthIndex) return "current";
  return "upcoming";
};

const buildDynamicTip = (templateItem, insights) => {
  const costRatio = Number(insights?.riskFlags?.find((item) => item.label === "Xarajat bosimi")?.value?.replace("%", "") || 0);
  const debtRatio = Number(insights?.riskFlags?.find((item) => item.label === "Qarz bosimi")?.value?.replace("%", "") || 0);
  const topProduct = insights?.topProducts?.[0];
  const topClient = insights?.topClients?.[0];
  const criticalInventory = (insights?.inventoryForecast || []).filter((item) => item.status === "critical").length;

  const tipParts = [];
  if (costRatio > 30) tipParts.push(`xarajat bosimi ${costRatio.toFixed(1)}%`);
  if (debtRatio > 12) tipParts.push(`qarz bosimi ${debtRatio.toFixed(1)}%`);
  if (criticalInventory > 0) tipParts.push(`stock riski ${criticalInventory} ta`);
  if (topProduct?.name) tipParts.push(`top mahsulot: ${topProduct.name}`);
  if (topClient?.name) tipParts.push(`top mijoz: ${topClient.name}`);

  if (tipParts.length === 0) {
    return `${templateItem.stage} bosqichida intizomni saqlash orqali barqaror o'sishni davom ettiring.`;
  }

  return `${templateItem.stage} uchun AI fokus: ${tipParts.join(", ")}.`;
};

function buildAutopilotRoadmap({ insights, year, now = new Date(), progressByMonth = {} }) {
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  const months = roadmapTemplate.map((item, index) => {
    const monthIndex = index + 1;
    const progress = progressByMonth[monthIndex] || {};
    const taskProgress = progress.taskProgress || {};
    const actions = item.actions.map((actionText, actionIndex) => ({
      id: `${monthIndex}-${actionIndex}`,
      index: actionIndex,
      text: actionText,
      isDone: Boolean(taskProgress[actionIndex]),
    }));
    const completedTasks = actions.filter((itemAction) => itemAction.isDone).length;
    const progressPercent = actions.length ? Math.round((completedTasks / actions.length) * 100) : 0;
    const isDone = Boolean(progress.completed) || (actions.length > 0 && completedTasks === actions.length);
    const defaultStatus = resolveStatus(index, currentMonthIndex, year, currentYear);
    const status = isDone ? "completed" : defaultStatus;

    return {
      monthIndex,
      monthName: monthNames[index],
      stage: item.stage,
      goal: item.goal,
      actions,
      kpi: item.kpi,
      aiTip: buildDynamicTip(item, insights),
      status,
      isDone,
      progressPercent,
      completedTasks,
      totalTasks: actions.length,
      note: progress.note || "",
      completedAt: progress.completedAt || null,
      updatedBy: progress.updatedBy || null,
    };
  });

  const currentMonthPlan =
    months.find((item) => item.status === "current") ||
    months.find((item) => item.status === "upcoming") ||
    months[months.length - 1];

  return {
    success: true,
    year,
    generatedAt: now,
    summary: {
      title: `${year} Smart Roadmap`,
      focus: currentMonthPlan?.stage || "Yillik reja",
      suggestion: currentMonthPlan?.aiTip || "Roadmap asosida bosqichma-bosqich harakat qiling.",
      totalStages: months.length,
      completedStages: months.filter((item) => item.isDone).length,
    },
    months,
  };
}

module.exports = {
  buildAutopilotRoadmap,
  roadmapTemplate,
};
