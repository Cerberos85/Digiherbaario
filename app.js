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

// Tilamuuttuja, johon valmiiksi käsitellyt kuvat tallennetaan lennosta
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

// --- 4. KUVIEN YKSITTÄINEN KÄSITTELY LENNOSTA ---
// Funktio, joka asettaa kuuntelijan halutulle inputille
function asetaKuvanKuuntelija(inputId, statusId, avain) {
  const inputElem = document.getElementById(inputId);
  const statusElem = document.getElementById(statusId);

  inputElem.addEventListener("change", async function(e) {
    const tiedosto = e.target.files[0];
    if (!tiedosto) return;

    // Haetaan kerääjän nimi vesileimaa varten (tai "Tuntematon", jos tyhjä)
    let oppilas = document.getElementById("oppilas").value || "Tuntematon";

    statusElem.textContent = "⏳ Käsitellään...";
    statusElem.style.color = "#d35400";
    document.getElementById("btn-tallenna").disabled = true; // Estetään tallennus käsittelyn ajaksi

    try {
      const base64Kuva = await prosessoiKuva(tiedosto, oppilas);
      kasitellytKuvat[avain] = base64Kuva;
      statusElem.textContent = "✅ Valmis!";
      statusElem.style.color = "#2e7d32";
    } catch (err) {
      console.error(err);
      statusElem.textContent = "❌ Käsittely epäonnistui.";
      statusElem.style.color = "red";
    } finally {
      document.getElementById("btn-tallenna").disabled = false;
    }
  });
}

// Asetetaan kuuntelijat jokaiselle 3 kuvalle
asetaKuvanKuuntelija("kuva-yleis", "status-yleis", "yleis");
asetaKuvanKuuntelija("kuva-runko", "status-runko", "runko");
asetaKuvanKuuntelija("kuva-lehti", "status-lehti", "lehti");


// Kuvan prosessointilogiikka (Canvas + vesileima)
function prosessoiKuva(tiedosto, oppilas) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = function() {
      const img = new Image();
      img.onload = function() {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          const MAX_WIDTH = 1000;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          const tarkkaAika = new Date().toLocaleString("fi-FI");
          const vesileimaTeksti = `${oppilas} | ${tarkkaAika}`;

          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.fillRect(0, height - 50, width, 50);
          ctx.font = "bold 24px Arial";
          ctx.fillStyle = "white";
          ctx.fillText(vesileimaTeksti, 15, height - 17);

          resolve(canvas.toDataURL("image/jpeg", 0.7)); 
        } catch(e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(tiedosto);
  });
}


// --- 5. HAVAINNON LOPULLINEN TALLENNUS ---
document.getElementById("kasvi-lomake").addEventListener("submit", function(e) {
  e.preventDefault();

  // Varmistetaan, että kaikki 3 kuvaa on otettu ja käsitelty onnistuneesti
  if (!kasitellytKuvat.yleis || !kasitellytKuvat.runko || !kasitellytKuvat.lehti) {
    alert("Ota kaikki kolme kuvaa ennen tallentamista!");
    return;
  }

  const laji = document.getElementById("laji").value;
  const tieteellinen = document.getElementById("tieteellinen").value;
  const pvm = document.getElementById("pvm").value;
  const oppilas = document.getElementById("oppilas").value;
  const lat = document.getElementById("lat").value;
  const lng = document.getElementById("lng").value;
  
  localStorage.setItem("oppilaanNimi", oppilas);

  const uusiHavainto = {
    laji: laji,
    tieteellinen: tieteellinen,
    pvm: pvm,
    oppilas: oppilas,
    sijainti: (lat && lng) ? `${lat}, ${lng}` : "Ei GPS-tietoa",
    kuvaYleis: kasitellytKuvat.yleis,
    kuvaRunko: kasitellytKuvat.runko,
    kuvaLehti: kasitellytKuvat.lehti
  };

  const transaction = db.transaction(["havainnot"], "readwrite");
  const store = transaction.objectStore("havainnot");
  const requestAdd = store.add(uusiHavainto);

  requestAdd.onsuccess = function() {
    document.getElementById("kasvi-lomake").reset();
    
    // Nollataan tilamuuttuja ja statustekstit uutta kasvia varten
    kasitellytKuvat = { yleis: null, runko: null, lehti: null };
    document.getElementById("status-yleis").textContent = "";
    document.getElementById("status-runko").textContent = "";
    document.getElementById("status-lehti").textContent = "";
    document.getElementById("gps-tulos").textContent = "Sijaintia ei haettu.";
    document.getElementById("gps-tulos").style.color = "#666";
    
    naytaKasvit();
    paivitaEdistyminen();
    alert("✅ Kasvi tallennettu onnistuneesti!");
  };
});

// --- 6. TALLENNETTUJEN KASVIEN LISTAUS UI:HIN ---
function naytaKasvit() {
  const kasvilista = document.getElementById("kasvilista");
  if(!kasvilista) return;
  kasvilista.innerHTML = "";

  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const requestCursor = store.openCursor();

  let onKasveja = false;

  requestCursor.onsuccess = function(e) {
    const cursor = e.target.result;
    if (cursor) {
      onKasveja = true;
      const havainto = cursor.value;

      const div = document.createElement("div");
      div.className = "kasvi-kortti";
      
      div.innerHTML = `
        <img src="${havainto.kuvaYleis}" alt="${havainto.laji}" class="kasvi-kuva">
        <div class="kasvi-tiedot">
          <h3>${havainto.laji}</h3>
          <p>📍 ${havainto.sijainti}</p>
          <p>📅 ${havainto.pvm}</p>
        </div>
      `;
      kasvilista.appendChild(div);
      cursor.continue();
    } else if (!onKasveja) {
      kasvilista.innerHTML = '<p class="tyhja-viesti">Ei vielä tallennettuja kasveja.</p>';
    }
  };
}

// --- 7. PDF:N LUONTI (WEB WORKER) ---
document.getElementById("btn-pdf").addEventListener("click", function() {
  const pdfNappi = document.getElementById("btn-pdf");
  
  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const requestData = store.getAll();

  requestData.onsuccess = function() {
    const kaikkiHavainnot = requestData.result;
    if (kaikkiHavainnot.length === 0) {
      alert("Ei havaintoja PDF-raporttia varten.");
      return;
    }

    const alkuperainenTeksti = pdfNappi.textContent;
    pdfNappi.textContent = "⏳ Luodaan raporttia...";
    pdfNappi.disabled = true;
    pdfNappi.style.backgroundColor = "#7f8c8d"; 

    const worker = new Worker('pdf-worker.js');
    worker.postMessage({ havainnot: kaikkiHavainnot });

    worker.onmessage = function(e) {
      if (e.data.status === 'valmis') {
        const blobUrl = URL.createObjectURL(e.data.blob);
        const latausLinkki = document.createElement("a");
        latausLinkki.href = blobUrl;
        latausLinkki.download = e.data.tiedostonimi;
        document.body.appendChild(latausLinkki);
        latausLinkki.click();
        document.body.removeChild(latausLinkki);
        URL.revokeObjectURL(blobUrl);
        worker.terminate();

        pdfNappi.textContent = alkuperainenTeksti;
        pdfNappi.disabled = false;
        pdfNappi.style.backgroundColor = ""; 
      }
    };

    worker.onerror = function(err) {
      alert("Virhe PDF:n luonnissa. Tarkista konsoli.");
      pdfNappi.textContent = alkuperainenTeksti;
      pdfNappi.disabled = false;
    };
  };
});

// --- 8. SERVICE WORKER REKISTERÖINTI ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log("SW virhe", err));
}
