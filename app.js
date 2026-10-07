/* app.js - Digiherbaarion päälogiikka */

const dbName = "DigiHerbaarioDB";
let db;

// --- Koulujen ja kurssien kasvilistat ---
const kouluData = {
  "hatanpaa_7lk": {
    nimi: "Hatanpään koulu - 7. luokan biologia",
    kasvit: ["Valkovuokko", "Kielo", "Siankärsämö", "Mustikka", "Voikukka", "Leskenlehti", "Oravanmarja", "Metsätähti"]
  },
  "tampere_ammatti": {
    nimi: "Tampereen Ammattiopisto - Puutarhuri 1",
    kasvit: ["Rauduskoivu", "Mänty", "Kuusi", "Harmaaleppä", "Pihlaja", "Vaahtera", "Kangasajuruoho", "Piharatamo"]
  }
};

// Objekti, joka pitää kirjaa lennosta käsitellyistä kuvista
let kasitellytKuvat = {
  yleis: null,
  runko: null,
  lehti: null
};

// --- 1. TIETOKANNAN ALUSTUS (IndexedDB) ---
const request = indexedDB.open(dbName, 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains("havainnot")) {
    db.createObjectStore("havainnot", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = function(e) {
  db = e.target.result;
  naytaKasvit();
  paivitaEdistyminen();
};

request.onerror = function(e) {
  console.error("Tietokantavirhe:", e.target.error);
};

// --- 2. KOULULISTAN LOGIIKKA ---
document.getElementById("koulu-valinta").addEventListener("change", function(e) {
  const valittuKoulu = e.target.value;
  localStorage.setItem("valittuKoulu", valittuKoulu);
  paivitaEdistyminen();
});

function paivitaEdistyminen() {
  const valittuKoulu = localStorage.getItem("valittuKoulu");
  const nakyma = document.getElementById("edistymis-nakyma");
  const selectElem = document.getElementById("koulu-valinta");
  const datalist = document.getElementById("kasvi-ehdotukset");

  if (valittuKoulu) selectElem.value = valittuKoulu;

  if (!valittuKoulu || !kouluData[valittuKoulu]) {
    nakyma.style.display = "none";
    if(datalist) datalist.innerHTML = ""; 
    return;
  }

  nakyma.style.display = "block";
  const vaaditutKasvit = kouluData[valittuKoulu].kasvit;

  if(datalist) {
    datalist.innerHTML = "";
    vaaditutKasvit.forEach(kasvi => {
      const option = document.createElement("option");
      option.value = kasvi;
      datalist.appendChild(option);
    });
  }

  if (!db) return; 
  
  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const requestStore = store.getAll();

  requestStore.onsuccess = function() {
    const tallennetutLajit = requestStore.result.map(havainto => havainto.laji.toLowerCase().trim());
    const tagContainer = document.getElementById("kasvi-tagit");
    if(!tagContainer) return;

    tagContainer.innerHTML = "";
    let keratytLkm = 0;

    vaaditutKasvit.forEach(vaadittu => {
      const span = document.createElement("span");
      span.textContent = vaadittu;
      span.className = "kasvi-tag";

      if (tallennetutLajit.includes(vaadittu.toLowerCase().trim())) {
        span.classList.add("keratty");
        keratytLkm++;
      }
      tagContainer.appendChild(span);
    });

    document.getElementById("keratty-lkm").textContent = keratytLkm;
    document.getElementById("yhteensa-lkm").textContent = vaaditutKasvit.length;
  };
}

// --- 3. PÄIVÄMÄÄRÄ, NIMI JA GPS ---
window.addEventListener("DOMContentLoaded", () => {
  const tanaan = new Date().toISOString().split('T')[0];
  document.getElementById("pvm").value = tanaan;
  
  const tallennettuNimi = localStorage.getItem("oppilaanNimi");
  if (tallennettuNimi) {
    document.getElementById("oppilas").value = tallennettuNimi;
  }
});

document.getElementById('btn-gps').addEventListener('click', () => {
  const tulos = document.getElementById('gps-tulos');
  tulos.textContent = "Haetaan sijaintia...";
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('lat').value = pos.coords.latitude;
        document.getElementById('lng').value = pos.coords.longitude;
        tulos.textContent = `✅ Sijainti lukittu: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        tulos.style.color = "green";
      },
      () => {
        tulos.textContent = "❌ Paikannus epäonnistui.";
        tulos.style.color = "red";
      },
      { enableHighAccuracy: true }
    );
  } else {
    tulos.textContent = "Selain ei tue paikannusta.";
  }
});

// --- 4. KUVIEN YKSITTÄINEN KÄSITTELY JA VALIKKOLOGIIKKA ---

// Yhdistetään kustomoidut napit piilotettuihin input-kenttiin
document.getElementById('btn-kamera-yleis').addEventListener('click', () => document.getElementById('kuva-yleis').click());
document.getElementById('btn-kamera-runko').addEventListener('click', () => document.getElementById('kuva-runko').click());
document.getElementById('btn-kamera-lehti').addEventListener('click', () => document.getElementById('kuva-lehti').click());

function asetaKuvanKuuntelija(inputId, statusId, avain, btnId) {
  const inputElem = document.getElementById(inputId);
  const statusElem = document.getElementById(statusId);
  const btnElem = document.getElementById(btnId);

  inputElem.addEventListener("change", async function(e) {
