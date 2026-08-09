/* =====================================================
   TARAS · CLIENT VERIFICATION
   Перевіряє Instagram-нік, введений користувачем, проти
   бази клієнтів. Якщо нік знайдено — показує модальне вікно
   з посиланням на Telegram-канал.

   ДЖЕРЕЛО ДАНИХ (на вибір):
   1) Google Таблиця, ОПУБЛІКОВАНА В ІНТЕРНЕТ як CSV.
      ВАЖЛИВО: звичайне посилання "Поділитися" (edit?usp=sharing)
      тут НЕ підійде. Потрібно: File → Share → Publish to web →
      обрати аркуш → формат CSV → Опублікувати. Отримане посилання
      виглядає так: https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv

      Структура таблиці: у стовпець A, по одному в рядок,
      Instagram-ніки клієнтів (без "@"), заголовок не потрібен.

   2) Якщо SHEET_CSV_URL порожній або таблиця недоступна —
      сайт автоматично використає data/clients.json.

   TELEGRAM: встав посилання на канал у CONFIG.TELEGRAM_URL —
   воно з'явиться в кнопці модального вікна після успішної перевірки.

   Бібліотека для парсингу CSV: PapaParse (підключена в
   index.html через CDN, глобальна змінна Papa).
   ===================================================== */

(function () {
  "use strict";

  var CONFIG = {
    SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vScaJwpvZIUFSsQ0pVIQH4emlYbhncxT2AouTPw05VYv_5J_SC6UFrYVuzfPREEqvGbj7iEEuqsxHgm/pub?gid=0&single=true&output=csv",
    LOCAL_FALLBACK_URL: "data/clients.json",
    // Встав сюди посилання на Telegram-канал, напр. "https://t.me/barsuto_channel"
    TELEGRAM_URL: ""
  };

  var form = document.getElementById("verify-form");
  if (!form) return; // секції немає на сторінці — нічого робити

  var input = document.getElementById("verify-input");
  var resultBox = document.getElementById("verify-result");
  var submitBtn = document.getElementById("verify-submit");
  var submitLabelOriginal = submitBtn ? submitBtn.textContent : "Перевірити";

  var modal = document.getElementById("verify-modal");
  var modalClose = document.getElementById("verify-modal-close");
  var modalLink = document.getElementById("verify-modal-link");
  var modalText = document.getElementById("verify-modal-text");

  var clientsCache = null;

  function normalizeNick(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/\/+$/, "");
  }

  // Опубліковані CSV Google Таблиць іноді кешуються — додаємо мітку часу,
  // щоб браузер завжди тягнув свіжу версію, а не стару з кешу.
  function withCacheBust(url) {
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep + "_ts=" + Date.now();
  }

  function loadFromCSV(url) {
    return fetch(withCacheBust(url), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("CSV fetch failed: HTTP " + r.status);
        return r.text();
      })
      .then(function (csvText) {
        // Якщо таблиця не опублікована правильно, Google повертає HTML
        // (сторінку логіну) замість CSV — ловимо це одразу.
        if (/^\s*<(!doctype|html)/i.test(csvText)) {
          throw new Error("Отримано HTML замість CSV — таблиця не опублікована як CSV");
        }
        var parsed = Papa.parse(csvText, { skipEmptyLines: true });
        return parsed.data
          .map(function (row) { return normalizeNick(row[0]); })
          .filter(Boolean);
      });
  }

  function loadFromJSON(url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("JSON fetch failed: HTTP " + r.status);
        return r.json();
      })
      .then(function (list) {
        return list
          .map(function (row) { return normalizeNick(row.instagram); })
          .filter(Boolean);
      });
  }

  function getClients() {
    if (clientsCache) return Promise.resolve(clientsCache);

    var loader = CONFIG.SHEET_CSV_URL
      ? loadFromCSV(CONFIG.SHEET_CSV_URL).catch(function (err) {
          console.warn("[verify] Google Sheet CSV недоступний, fallback на локальний JSON:", err);
          return loadFromJSON(CONFIG.LOCAL_FALLBACK_URL);
        })
      : loadFromJSON(CONFIG.LOCAL_FALLBACK_URL);

    return loader.then(function (list) {
      clientsCache = list;
      return list;
    });
  }

  function setResult(state, text) {
    resultBox.hidden = false;
    resultBox.classList.remove("is-ok", "is-fail", "is-loading");
    resultBox.classList.add(state);
    resultBox.textContent = text;
  }

  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Перевіряю…" : submitLabelOriginal;
  }

  /* ---------- модальне вікно успіху ---------- */
  function openModal(nick) {
    if (!modal) return;

    if (CONFIG.TELEGRAM_URL) {
      modalLink.href = CONFIG.TELEGRAM_URL;
      modalLink.removeAttribute("aria-disabled");
      modalText.textContent = "Приєднуйся до закритого Telegram-каналу з матеріалами інтенсиву, @" + nick + ".";
    } else {
      modalLink.href = "#";
      modalLink.setAttribute("aria-disabled", "true");
      modalText.textContent = "Посилання на Telegram-канал скоро з'явиться тут — слідкуй за Instagram, поки що напиши в директ.";
    }

    modal.hidden = false;
    requestAnimationFrame(function () {
      modal.classList.add("is-visible");
    });
    document.addEventListener("keydown", onModalKeydown);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-visible");
    document.removeEventListener("keydown", onModalKeydown);
    setTimeout(function () {
      modal.hidden = true;
    }, 250);
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") closeModal();
  }

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }

  /* ---------- запобіжник: сайт відкрито як файл, а не через сервер ---------- */
  if (location.protocol === "file:") {
    setResult(
      "is-fail",
      "Перевірка працює лише коли сайт відкрито через сервер (localhost або реальний хостинг), " +
      "а не подвійним кліком по файлу. У VS Code онови сторінку через розширення Live Server."
    );
  }

  /* ---------- сабміт форми ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (location.protocol === "file:") {
      setResult(
        "is-fail",
        "Перевірка не працює при відкритті файлу напряму. Відкрий сайт через Live Server або реальний хостинг."
      );
      return;
    }

    var nick = normalizeNick(input.value);
    if (!nick) {
      input.focus();
      return;
    }

    setLoading(true);
    setResult("is-loading", "Перевіряю базу…");

    getClients()
      .then(function (list) {
        var found = list.indexOf(nick) !== -1;
        if (found) {
          setResult("is-ok", "✅ Доступ підтверджено — @" + nick + " є в базі клієнтів.");
          openModal(nick);
        } else {
          setResult(
            "is-fail",
            "❌ @" + nick + " не знайдено в базі. Перевір нік або напиши в Instagram."
          );
        }
      })
      .catch(function (err) {
        console.error("[verify] Не вдалося отримати список клієнтів:", err);
        setResult("is-fail", "Не вдалося перевірити базу зараз. Спробуй ще раз трохи пізніше.");
      })
      .finally(function () {
        setLoading(false);
      });
  });
})();
