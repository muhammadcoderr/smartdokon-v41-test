function getAdminButtons() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "💰 Kassa" }, { text: "🛒 Mahsulotlar" }],
        [{ text: "❌ Xarajatlar" }],
      ],
      resize_keyboard: true,
    },
  };
}

function getOwnerButtons() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Dashboard" }, { text: "💰 Kassa" }],
        [{ text: "📦 Ombor" }, { text: "👤 Adminlar" }],
        [{ text: "❌ Xarajatlar" }, { text: "📢 Reklama" }],
      ],
      resize_keyboard: true,
    },
  };
}

function generateButtons(role, isOwner = false) {
  if (isOwner) {
    return getOwnerButtons();
  }
  if (role === "admin") {
    return getAdminButtons();
  }
}

module.exports = { generateButtons };
