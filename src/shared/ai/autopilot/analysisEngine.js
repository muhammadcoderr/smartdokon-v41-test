const {
  dashboardTimezone,
  getDateStringInTimezone,
  sumProductProfit,
  sumProductQuantity,
  formatMoney,
  buildPriority,
  buildDebtAdvice,
} = require("./utils");

const getPaymentRevenue = (payment) => Number(payment.discountPrice || payment.totalPrice || 0);

const getPercentChange = (current, previous) => {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / previous) * 100;
};

const getSeverity = (score) => {
  if (score >= 80) return "critical";
  if (score >= 45) return "watch";
  return "healthy";
};

function analyzeAutopilotData({
  now,
  fromDate,
  windowDays,
  payments,
  products,
  costs,
  clients,
  users = [],
  loginEvents = [],
}) {
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const clientMap = new Map(clients.map((client) => [String(client._id), client]));
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const loginEventMap = new Map();
  loginEvents.forEach((event) => {
    const key = String(event.userId || "");
    loginEventMap.set(key, (loginEventMap.get(key) || 0) + 1);
  });

  const overview = payments.reduce(
    (acc, payment) => {
      const revenue = getPaymentRevenue(payment);
      acc.totalRevenue += revenue;
      acc.totalProfit += sumProductProfit(payment.products);
      acc.totalSales += 1;
      acc.totalItems += sumProductQuantity(payment.products);
      acc.totalDebtFromSales += Number(payment.indebtedness || 0);
      acc.totalCashback += Number(payment.cashback || 0);
      return acc;
    },
    {
      totalRevenue: 0,
      totalProfit: 0,
      totalSales: 0,
      totalItems: 0,
      totalDebtFromSales: 0,
      totalCashback: 0,
    }
  );

  const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  const totalClientDebt = clients.reduce(
    (sum, client) => sum + (client.debts || []).reduce((inner, debt) => inner + Number(debt.amount || 0), 0),
    0
  );

  const trendMap = new Map();
  payments.forEach((payment) => {
    const dateKey = getDateStringInTimezone(new Date(payment.createdAt), dashboardTimezone);
    const existing = trendMap.get(dateKey) || {
      date: dateKey,
      revenue: 0,
      profit: 0,
      count: 0,
    };
    existing.revenue += Number(payment.discountPrice || payment.totalPrice || 0);
    existing.profit += sumProductProfit(payment.products);
    existing.count += 1;
    trendMap.set(dateKey, existing);
  });
  const allTrends = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const trends = allTrends.slice(-14);

  const costBreakdownMap = costs.reduce((acc, cost) => {
    const key = cost.category || "other";
    acc[key] = (acc[key] || 0) + Number(cost.amount || 0);
    return acc;
  }, {});
  const costBreakdown = Object.entries(costBreakdownMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const productStatsMap = {};
  payments.forEach((payment) => {
    (payment.products || []).forEach((line) => {
      const productId = String(line.productId || "");
      const productInfo = productMap.get(productId);
      const key = productId || productInfo?.name || "unknown";
      if (!productStatsMap[key]) {
        productStatsMap[key] = {
          productId,
          name: productInfo?.name || line.name || "Mahsulot",
          quantity: 0,
          profit: 0,
          revenue: 0,
          stock: Number(productInfo?.avialable || 0),
          minimumStock: Number(productInfo?.minimumStock || 0),
          margin:
            Number(productInfo?.sellingprice || 0) > 0
              ? ((Number(productInfo?.sellingprice || 0) - Number(productInfo?.arrivalprice || 0)) /
                  Number(productInfo?.sellingprice || 1)) *
                100
              : 0,
        };
      }
      productStatsMap[key].quantity += Number(line.quantity || 0);
      productStatsMap[key].profit += Number(line.profit || 0);
      productStatsMap[key].revenue += Number(line.quantity || 0) * Number(productInfo?.sellingprice || 0);
    });
  });

  const topProducts = Object.values(productStatsMap)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8);

  const slowProducts = products
    .map((product) => {
      const stat = Object.values(productStatsMap).find((entry) => entry.productId === String(product._id));
      return {
        productId: String(product._id),
        name: product.name,
        quantity: stat?.quantity || 0,
        stock: Number(product.avialable || 0),
        minimumStock: Number(product.minimumStock || 0),
        category: product.category || "other",
      };
    })
    .filter((product) => product.stock > Math.max(product.minimumStock * 2, 5) && product.quantity < 3)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 6);

  const clientStatsMap = {};
  payments.forEach((payment) => {
    const clientId = String(payment.clientId || "");
    const client = clientMap.get(clientId);
    const key = clientId || client?.firstname || "unknown";
    if (!clientStatsMap[key]) {
      clientStatsMap[key] = {
        clientId,
        name: client?.firstname || "Noma'lum mijoz",
        revenue: 0,
        profit: 0,
        purchases: 0,
        debt: (client?.debts || []).reduce((sum, debt) => sum + Number(debt.amount || 0), 0),
      };
    }
    clientStatsMap[key].revenue += Number(payment.discountPrice || payment.totalPrice || 0);
    clientStatsMap[key].profit += sumProductProfit(payment.products);
    clientStatsMap[key].purchases += 1;
  });

  const topClients = Object.values(clientStatsMap)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8);

  const debtors = clients
    .map((client) => {
      const debts = client.debts || [];
      const totalDebt = debts.reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
      const oldestDebt = debts
        .map((debt) => new Date(debt.date))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b)[0];
      const oldestDebtDays = oldestDebt
        ? Math.max(0, Math.floor((now.getTime() - oldestDebt.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        clientId: client._id,
        name: client.firstname,
        totalDebt,
        debtCount: debts.length,
        oldestDebtDays,
        phone: client.phone,
        advice: buildDebtAdvice({ totalDebt, oldestDebtDays }),
      };
    })
    .filter((client) => client.totalDebt > 0)
    .sort((a, b) => b.totalDebt - a.totalDebt)
    .slice(0, 8);

  const recentSales = payments.filter((payment) => new Date(payment.createdAt) >= sevenDaysAgo);
  const recentRevenue = recentSales.reduce(
    (sum, payment) => sum + getPaymentRevenue(payment),
    0
  );
  const recentProfit = recentSales.reduce((sum, payment) => sum + sumProductProfit(payment.products), 0);
  const previousPeriodStart = new Date(sevenDaysAgo);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
  const previousSales = payments.filter((payment) => {
    const createdAt = new Date(payment.createdAt);
    return createdAt >= previousPeriodStart && createdAt < sevenDaysAgo;
  });
  const previousRevenue = previousSales.reduce((sum, payment) => sum + getPaymentRevenue(payment), 0);
  const previousProfit = previousSales.reduce((sum, payment) => sum + sumProductProfit(payment.products), 0);

  const revenueTrendPercent = previousRevenue > 0 ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
  const profitTrendPercent = previousProfit > 0 ? ((recentProfit - previousProfit) / previousProfit) * 100 : 0;
  const debtRatio = overview.totalRevenue > 0 ? (totalClientDebt / overview.totalRevenue) * 100 : 0;
  const costRatio = overview.totalRevenue > 0 ? (totalCosts / overview.totalRevenue) * 100 : 0;
  const averageDailyRevenue = windowDays > 0 ? overview.totalRevenue / windowDays : 0;
  const averageDailyProfit = windowDays > 0 ? overview.totalProfit / windowDays : 0;

  const lastSevenTrend = allTrends.slice(-7);
  const weightedRevenue =
    lastSevenTrend.reduce((sum, item, index) => sum + item.revenue * (index + 1), 0) /
    Math.max(lastSevenTrend.reduce((sum, _item, index) => sum + index + 1, 0), 1);
  const weightedProfit =
    lastSevenTrend.reduce((sum, item, index) => sum + item.profit * (index + 1), 0) /
    Math.max(lastSevenTrend.reduce((sum, _item, index) => sum + index + 1, 0), 1);
  const momentum = revenueTrendPercent >= 15 ? "strong" : revenueTrendPercent >= 0 ? "stable" : "declining";
  const forecastConfidence = Math.max(
    42,
    Math.min(
      92,
      60 + (allTrends.length >= 14 ? 12 : 0) + (previousRevenue > 0 ? 8 : 0) - Math.min(Math.abs(revenueTrendPercent) / 4, 18)
    )
  );

  const forecast = {
    next7DaysRevenue: Math.max(0, Math.round(weightedRevenue * 7)),
    next7DaysProfit: Math.max(0, Math.round(weightedProfit * 7)),
    confidence: Math.round(forecastConfidence),
    basis: `${Math.min(allTrends.length, 14)} kunlik tarix va 7 kunlik trend`,
    momentum,
    dailyAverageRevenue: Math.round(averageDailyRevenue),
    dailyAverageProfit: Math.round(averageDailyProfit),
    revenueTrendPercent: Number(revenueTrendPercent.toFixed(1)),
    profitTrendPercent: Number(profitTrendPercent.toFixed(1)),
  };

  const anomalies = [];
  if (costRatio > 35) {
    anomalies.push({
      id: "cost-spike",
      type: "cost",
      severity: getSeverity(costRatio * 2),
      title: "Xarajat bosimi yuqori",
      metric: `${costRatio.toFixed(1)}%`,
      summary: `Xarajatlar tushumga nisbatan yuqori. Eng katta ulush ${costBreakdown[0]?.name || "other"} kategoriyasida.`,
      action: costBreakdown[0]
        ? `${costBreakdown[0].name} xarajatlari uchun limit va tasdiqlash nazoratini yoqing.`
        : "Xarajatlar kategoriyalarini qayta segmentlang va kunlik limit qo'ying.",
    });
  }
  if (revenueTrendPercent < -12) {
    anomalies.push({
      id: "sales-drop",
      type: "sales",
      severity: getSeverity(Math.abs(revenueTrendPercent) * 3),
      title: "Tushum pasayishi aniqlandi",
      metric: `${revenueTrendPercent.toFixed(1)}%`,
      summary: "Oxirgi 7 kun oldingi davrga nisbatan savdo sustlashgan.",
      action: "Top mahsulotlar uchun aksiya, qayta xarid triggeri va faol sotuvchilarni alohida kuzating.",
    });
  }
  if (debtRatio > 20) {
    anomalies.push({
      id: "debt-pressure",
      type: "debt",
      severity: getSeverity(debtRatio * 3),
      title: "Qarz bosimi kuchaygan",
      metric: `${debtRatio.toFixed(1)}%`,
      summary: "Mijoz qarzlari tushumga nisbatan yuqori ulushni egallayapti.",
      action: "30 kundan eski qarzlar uchun alohida undirish ssenariysi ishlating.",
    });
  }
  if (slowProducts.length >= 4) {
    anomalies.push({
      id: "inventory-stuck",
      type: "inventory",
      severity: getSeverity(slowProducts.length * 15),
      title: "Sekin aylanayotgan zaxira ko'paygan",
      metric: `${slowProducts.length} ta`,
      summary: "Bir nechta mahsulot zaxirada ortiqcha turib qolgan.",
      action: "Bundle, chegirma yoki vitrinadagi joylashuvni o'zgartirish orqali chiqimini tezlashtiring.",
    });
  }

  const rootCauses = [
    {
      id: "profit-vs-cost",
      title: "Foyda va xarajat nisbati",
      insight:
        costRatio > 30
          ? "Xarajatlar sof foydani siqmoqda, operatsion xarajatlar qayta ko'rib chiqilishi kerak."
          : "Foyda-xarajat balansi nazorat ostida, hozir e'tibor tushumni tezlatishga qaratilishi mumkin.",
      metric: `${formatMoney(overview.totalProfit - totalCosts)} so'm`,
    },
    {
      id: "top-product-dependence",
      title: "Mahsulotga qaramlik",
      insight:
        topProducts[0] && topProducts[1]
          ? `Top 2 mahsulot jami ${formatMoney(topProducts[0].profit + topProducts[1].profit)} so'm foyda berdi.`
          : "Mahsulot kesimida chuqur qaramlikni aniqlash uchun ma'lumot kam.",
      metric: topProducts[0]?.name || "Ma'lumot yo'q",
    },
    {
      id: "client-concentration",
      title: "Mijoz konsentratsiyasi",
      insight:
        topClients[0]
          ? `${topClients[0].name} eng katta foyda manbai. Shu segmentni ushlab qolish muhim.`
          : "Mijoz segmentlari hali aniq ajralmagan.",
      metric: topClients[0] ? formatMoney(topClients[0].profit) : "0 so'm",
    },
    {
      id: "trend-driver",
      title: "So'nggi 7 kun drayveri",
      insight:
        revenueTrendPercent >= 0
          ? "Oxirgi haftadagi momentum ijobiy, ommabop mahsulotlar zaxirasini ko'paytirish mumkin."
          : "Pasayish kuzatilmoqda, kampaniya va sotuvchi faoliyatini qayta faollashtirish kerak.",
      metric: `${revenueTrendPercent >= 0 ? "+" : ""}${revenueTrendPercent.toFixed(1)}%`,
    },
  ];

  const collectionSegments = [
    {
      id: "critical",
      label: "Zudlik bilan undirish",
      count: debtors.filter((item) => item.totalDebt >= 1000000 || item.oldestDebtDays >= 30).length,
      action: "Qo'ng'iroq + aniq to'lov jadvali + keyingi savdoda cheklov.",
    },
    {
      id: "watch",
      label: "Nazorat ostidagi qarzlar",
      count: debtors.filter((item) => item.totalDebt >= 300000 && item.totalDebt < 1000000 && item.oldestDebtDays < 30).length,
      action: "Telegram eslatma va qisman to'lov varianti yuboring.",
    },
    {
      id: "soft",
      label: "Yumshoq eslatma segmenti",
      count: debtors.filter((item) => item.totalDebt < 300000).length,
      action: "Savdo oldidan eslatma va bonusli tez to'lov taklifi bering.",
    },
  ];

  const inventoryForecast = products
    .map((product) => {
      const stat = Object.values(productStatsMap).find((entry) => entry.productId === String(product._id));
      const soldQuantity = Number(stat?.quantity || 0);
      const dailyVelocity = windowDays > 0 ? soldQuantity / windowDays : 0;
      const stock = Number(product.avialable || 0);
      const daysLeft = dailyVelocity > 0 ? stock / dailyVelocity : null;
      const status =
        daysLeft === null
          ? "stable"
          : daysLeft <= 7
            ? "critical"
            : daysLeft <= 21
              ? "watch"
              : "healthy";

      return {
        productId: String(product._id),
        name: product.name,
        category: product.category || "other",
        stock,
        minimumStock: Number(product.minimumStock || 0),
        soldQuantity,
        dailyVelocity: Number(dailyVelocity.toFixed(2)),
        daysLeft: daysLeft === null ? null : Number(daysLeft.toFixed(1)),
        status,
      };
    })
    .filter((item) => item.dailyVelocity > 0 && item.stock > 0)
    .sort((a, b) => {
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    })
    .slice(0, 8);

  const costCategoryAlerts = costBreakdown
    .map((item) => {
      const previousCategoryValue = costs
        .filter((cost) => {
          const createdAt = new Date(cost.createdAt);
          return createdAt >= previousPeriodStart && createdAt < sevenDaysAgo && (cost.category || "other") === item.name;
        })
        .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
      const currentCategoryValue = costs
        .filter((cost) => {
          const createdAt = new Date(cost.createdAt);
          return createdAt >= sevenDaysAgo && (cost.category || "other") === item.name;
        })
        .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
      const changePercent = getPercentChange(currentCategoryValue, previousCategoryValue);
      const sharePercent = totalCosts > 0 ? (item.value / totalCosts) * 100 : 0;

      return {
        category: item.name,
        currentValue: Math.round(currentCategoryValue),
        previousValue: Math.round(previousCategoryValue),
        changePercent: Number(changePercent.toFixed(1)),
        sharePercent: Number(sharePercent.toFixed(1)),
        severity:
          currentCategoryValue > previousCategoryValue * 1.35 || sharePercent > 45
            ? "critical"
            : changePercent > 15 || sharePercent > 25
              ? "watch"
              : "healthy",
      };
    })
    .filter((item) => item.currentValue > 0)
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 6);

  const userPerformanceMap = {};
  payments.forEach((payment) => {
    const sellerId = String(payment.sellerId || "");
    const seller =
      userMap.get(sellerId) ||
      users.find(
        (entry) =>
          entry.login === payment.sellerlogin ||
          entry.firstname === payment.sellername
      );
    const key = sellerId || seller?.login || payment.sellername || "unknown";
    if (!userPerformanceMap[key]) {
      userPerformanceMap[key] = {
        sellerId: seller ? String(seller._id) : sellerId,
        name: seller?.firstname || payment.sellername || "Noma'lum foydalanuvchi",
        login: seller?.login || payment.sellerlogin || "",
        type: seller?.type || "sotuvchi",
        status: seller?.status || "active",
        lastseen: seller?.lastseen || null,
        revenue: 0,
        profit: 0,
        salesCount: 0,
        avgCheck: 0,
        recentLoginCount: seller ? loginEventMap.get(String(seller._id)) || 0 : 0,
      };
    }
    userPerformanceMap[key].revenue += getPaymentRevenue(payment);
    userPerformanceMap[key].profit += sumProductProfit(payment.products);
    userPerformanceMap[key].salesCount += 1;
  });

  const userPerformance = Object.values(userPerformanceMap)
    .map((seller) => ({
      ...seller,
      avgCheck: seller.salesCount > 0 ? Math.round(seller.revenue / seller.salesCount) : 0,
      sharePercent: overview.totalRevenue > 0 ? Number(((seller.revenue / overview.totalRevenue) * 100).toFixed(1)) : 0,
      activityStatus:
        seller.lastseen && now.getTime() - new Date(seller.lastseen).getTime() <= 3 * 24 * 60 * 60 * 1000
          ? "active"
          : "idle",
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8);

  const dailyActionPlan = [
    {
      id: "follow-debtors",
      label: "Qarzlarni undirish",
      owner: "Admin",
      priority: debtors.length > 3 ? "high" : debtors.length > 0 ? "medium" : "low",
      task:
        debtors[0]
          ? `${debtors[0].name} va eng katta 3 qarzdor bilan bog'lanib to'lov jadvalini tasdiqlang.`
          : "Qarz bosimi past, yangi savdolarda to'lov intizomini saqlang.",
    },
    {
      id: "restock-fast-movers",
      label: "Zaxirani boshqarish",
      owner: "Ombor / Xarid",
      priority: inventoryForecast.some((item) => item.status === "critical") ? "high" : "medium",
      task:
        inventoryForecast.find((item) => item.status === "critical")
          ? `${inventoryForecast.find((item) => item.status === "critical").name} bo'yicha qayta buyurtma bering.`
          : "Top mahsulotlar uchun xavfsiz zaxira darajasini yangilang.",
    },
    {
      id: "reduce-costs",
      label: "Xarajatni siqish",
      owner: "Admin",
      priority: costCategoryAlerts[0]?.severity === "critical" ? "high" : "medium",
      task:
        costCategoryAlerts[0]
          ? `${costCategoryAlerts[0].category} kategoriyasidagi xarajatlar uchun limit va tasdiqlash tartibini joriy qiling.`
          : "Kategoriyalar bo'yicha xarajat limitini qayta ko'rib chiqing.",
    },
    {
      id: "push-team",
      label: "Jamoa fokusini belgilash",
      owner: "Admin / Menejer",
      priority: userPerformance.some((item) => item.activityStatus === "idle") ? "medium" : "low",
      task:
        userPerformance.find((item) => item.activityStatus === "idle")
          ? `${userPerformance.find((item) => item.activityStatus === "idle").name} uchun qisqa sotuv sprint rejasi tuzing.`
          : "Eng yaxshi foydalanuvchi yondashuvini jamoaga standart qilib tarqating.",
    },
  ];

  const recommendations = [
    {
      id: "cost-control",
      title: "Xarajatlar nazorati",
      priority: buildPriority(costRatio),
      summary:
        costRatio > 35
          ? `Oxirgi ${windowDays} kunda xarajatlar tushumning ${costRatio.toFixed(1)}% ini egalladi.`
          : `Xarajatlar tushumning ${costRatio.toFixed(1)}% ini egallamoqda, nazorat ostida.`,
      action:
        costBreakdown[0]
          ? `${costBreakdown[0].name} kategoriyasidagi xarajatlarni qayta ko'rib chiqing va limit belgilang.`
          : "Operatsion xarajatlar uchun haftalik limit belgilang.",
    },
    {
      id: "debt-collection",
      title: "Qarz undirish strategiyasi",
      priority: buildPriority(debtRatio),
      summary: `${debtors.length} ta mijozda jami ${formatMoney(totalClientDebt)} so'm qarz mavjud.`,
      action:
        debtors[0]
          ? `${debtors[0].name} bilan birinchi navbatda bog'laning: ${debtors[0].advice}`
          : "Qarzlar past, lekin yangi savdolar uchun oldindan to'lov siyosatini saqlang.",
    },
    {
      id: "product-focus",
      title: "Mahsulot fokusini kuchaytirish",
      priority: topProducts[0]?.profit > 0 ? "medium" : "low",
      summary:
        topProducts[0]
          ? `${topProducts[0].name} eng ko'p foyda berdi: ${formatMoney(topProducts[0].profit)} so'm.`
          : "Foyda beruvchi mahsulotlar bo'yicha ma'lumot yetarli emas.",
      action:
        topProducts[0]
          ? `${topProducts[0].name} va top-3 mahsulotlar uchun ko'rinarli joylashtirish va zaxira rejasi tuzing.`
          : "Mahsulot foydasi bo'yicha minimal 7 kunlik savdo tarixini yig'ing.",
    },
    {
      id: "client-growth",
      title: "Mijoz segmentlari bilan ishlash",
      priority: topClients[0]?.purchases >= 3 ? "medium" : "low",
      summary:
        topClients[0]
          ? `${topClients[0].name} eng foydali mijoz: ${formatMoney(topClients[0].profit)} so'm foyda.`
          : "Mijozlar bo'yicha foyda tahlili uchun ko'proq savdo kerak.",
      action:
        topClients[0]
          ? "Top mijozlar uchun bonus yoki qayta xarid taklifi tayyorlang, past aktiv mijozlarga alohida kampaniya yuboring."
          : "Sodiq mijozlar uchun segmentatsiya tayyorlang.",
    },
    {
      id: "seller-focus",
      title: "Jamoa fokusini qayta taqsimlash",
      priority: userPerformance[0]?.sharePercent >= 35 ? "medium" : "low",
      summary:
        userPerformance[0]
          ? `${userPerformance[0].name} tushumning ${userPerformance[0].sharePercent}% ulushini olib kelmoqda.`
          : "Foydalanuvchilar bo'yicha savdo ma'lumoti yetarli emas.",
      action:
        userPerformance[0]
          ? "Top foydalanuvchi tajribasini standartga aylantirib, sust foydalanuvchilar uchun qisqa sprint reja tuzing."
          : "Seller kesimidagi savdo yozuvlarini to'liq bog'lanishini tekshirib chiqing.",
    },
  ];

  const riskFlags = [
    {
      label: "Qarz bosimi",
      value: `${debtRatio.toFixed(1)}%`,
      status: debtRatio > 20 ? "critical" : debtRatio > 10 ? "watch" : "healthy",
    },
    {
      label: "Xarajat bosimi",
      value: `${costRatio.toFixed(1)}%`,
      status: costRatio > 35 ? "critical" : costRatio > 20 ? "watch" : "healthy",
    },
    {
      label: "7 kunlik trend",
      value: `${revenueTrendPercent >= 0 ? "+" : ""}${revenueTrendPercent.toFixed(1)}%`,
      status: revenueTrendPercent < 0 ? "watch" : "healthy",
    },
    {
      label: "Foyda trendlari",
      value: `${profitTrendPercent >= 0 ? "+" : ""}${profitTrendPercent.toFixed(1)}%`,
      status: profitTrendPercent < 0 ? "watch" : "healthy",
    },
  ];

  return {
    success: true,
    meta: {
      generatedAt: now,
      fromDate,
      windowDays,
      paymentCount: payments.length,
      productCount: products.length,
      costCount: costs.length,
      clientCount: clients.length,
      userCount: users.length,
      loginEventCount: loginEvents.length,
      },
      overview: {
      ...overview,
      totalCosts,
      netProfit: overview.totalProfit - totalCosts,
      totalClientDebt,
      debtClientsCount: debtors.length,
      },
      forecast,
      anomalies,
      rootCauses,
      collectionSegments,
      inventoryForecast,
      costCategoryAlerts,
      dailyActionPlan,
      trends,
      costBreakdown,
      topProducts,
      slowProducts,
      topClients,
      debtors,
      userPerformance,
      riskFlags,
      recommendations,
      };
}

module.exports = {
  analyzeAutopilotData,
};
