const dbName = "DigiHerbaarioDB";
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
let db;

// 1. Alustetaan IndexedDB-tietokanta
const request = indexedDB.open(dbName, 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains("havainnot")) {
    db.createObjectStore("havainnot", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = function(e) {
  db = e.target.result;
  naytaKasvit(); // Haetaan ja näytetään tallennetut kasvit
};

request.onerror = function(e) {
  console.error("Tietokantavirhe:", e.target.error);
};

// 2. Lomakkeen lähetys ja kuvan muuntaminen Base64-muotoon
// 2. Lomakkeen lähetys ja kuvan vesileimaus (Canvas API)
document.getElementById("kasvi-lomake").addEventListener("submit", function(e) {
  e.preventDefault();

  const laji = document.getElementById("laji").value;
  const paikka = document.getElementById("paikka").value;
  const pvm = document.getElementById("pvm").value;
  const oppilas = document.getElementById("oppilas").value;
  const kuvaTiedosto = document.getElementById("kuva").files[0];

  // Tallennetaan oppilaan nimi LocalStorageen, jotta sitä ei tarvitse kirjoittaa joka kerta uudestaan
  localStorage.setItem("oppilaanNimi", oppilas);

  const reader = new FileReader();
  reader.onloadend = function() {
    // Kutsutaan funktiota, joka tekee vesileiman
    poltaVesileimaJaTallenna(reader.result, laji, paikka, pvm, oppilas);
  };

  if (kuvaTiedosto) {
    reader.readAsDataURL(kuvaTiedosto);
  }
});

// Asetetaan tallennettu nimi valmiiksi kenttään sivun latautuessa
window.addEventListener("DOMContentLoaded", () => {
  const tallennettuNimi = localStorage.getItem("oppilaanNimi");
  if (tallennettuNimi) {
    document.getElementById("oppilas").value = tallennettuNimi;
  }
});

// Funktio: Kuvan skaalaus, vesileimaus ja tallennus
function poltaVesileimaJaTallenna(kuvaDataUrl, laji, paikka, pvm, oppilas) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Skaalataan kuva järkevän kokoiseksi (esim. max leveys 1200px) säästääksemme muistia
    const MAX_WIDTH = 1200;
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    canvas.width = width;
    canvas.height = height;

    // Piirretään alkuperäinen kuva kankaalle (canvas)
    ctx.drawImage(img, 0, 0, width, height);

    // Määritetään vesileiman teksti (Nimi + tarkka aika)
    const tarkkaAika = new Date().toLocaleString("fi-FI"); // Esim. 17.8.2026 klo 9.39.15
    const vesileimaTeksti = `Kerääjä: ${oppilas} | Kuvattu: ${tarkkaAika}`;

    // Piirretään puoliläpinäkyvä tumma tausta tekstille alareunaan
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, height - 60, width, 60);

    // Piirretään valkoinen teksti taustan päälle
    ctx.font = "bold 28px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(vesileimaTeksti, 20, height - 20);

    // Muunnetaan vesileimattu kuva takaisin Base64-muotoon (.jpeg, 80% laatu)
    const vesileimattuKuvaBase64 = canvas.toDataURL("image/jpeg", 0.8);

    const uusiHavainto = {
      laji: laji,
      paikka: paikka,
      pvm: pvm,
      oppilas: oppilas,
      kuva: vesileimattuKuvaBase64 // Tämä on nyt huijaussuojattu kuva!
    };

    tallennaTietokantaan(uusiHavainto);
  };
  
  img.src = kuvaDataUrl;
}

// 3. Haetaan havainnot tietokannasta ja tulostetaan näytölle
function naytaKasvit() {
  const kasvilista = document.getElementById("kasvilista");
  kasvilista.innerHTML = "";

  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const request = store.openCursor();

  let onKasveja = false;

  request.onsuccess = function(e) {
    const cursor = e.target.result;
    if (cursor) {
      onKasveja = true;
      const havainto = cursor.value;

      const div = document.createElement("div");
      div.className = "kasvi-kortti";
      div.innerHTML = `
        <img src="${havainto.kuva}" alt="${havainto.laji}" class="kasvi-kuva">
        <div class="kasvi-tiedot">
          <h3>${havainto.laji}</h3>
          <p>📍 ${havainto.paikka}</p>
          <p>📅 ${havainto.pvm}</p>
        </div>
      `;
      kasvilista.appendChild(div);
      cursor.continue();
    } else if (!onKasveja) {
      kasvilista.innerHTML = '<p class="tyhja-viesti">Ei vielä tallennettuja kasveja. Lähde maastoon!</p>';
    }
  };
}

// 4. Suojatun PDF:n luominen (jsPDF) - Ammatillinen versio (3 kuvaa/kasvi)
// PDF:n luonti Web Workerin avulla (Käyttöliittymä ei jäädy!)
document.getElementById("btn-pdf").addEventListener("click", function() {
  const pdfNappi = document.getElementById("btn-pdf");
  
  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const request = store.getAll();

  request.onsuccess = function() {
    const kaikkiHavainnot = request.result;
    if (kaikkiHavainnot.length === 0) {
      alert("Ei havaintoja PDF-raporttia varten.");
      return;
    }

    // 1. Muutetaan napin tila latauksen ajaksi
    const alkuperainenTeksti = pdfNappi.textContent;
    pdfNappi.textContent = "⏳ Luodaan raporttia (Tämä voi kestää...)";
    pdfNappi.disabled = true;
    pdfNappi.style.backgroundColor = "#7f8c8d"; // Harmaannetaan nappi

    // 2. Käynnistetään Web Worker
    const worker = new Worker('pdf-worker.js');

    // 3. Lähetetään kasvidata Workerille prosessoitavaksi
    worker.postMessage({ havainnot: kaikkiHavainnot });

    // 4. Odotetaan Workerin vastausta (Kun PDF on valmis)
    worker.onmessage = function(e) {
      if (e.data.status === 'valmis') {
        const pdfBlob = e.data.blob;
        const tiedostonimi = e.data.tiedostonimi;

        // Luodaan Blob-objektista ladattava URL
        const blobUrl = URL.createObjectURL(pdfBlob);

        // Luodaan väliaikainen HTML-linkki ja "klikataan" sitä latauksen aloittamiseksi
        const latausLinkki = document.createElement("a");
        latausLinkki.href = blobUrl;
        latausLinkki.download = tiedostonimi;
        document.body.appendChild(latausLinkki);
        latausLinkki.click();
        document.body.removeChild(latausLinkki);

        // Vapautetaan selaimen muisti ja suljetaan worker
        URL.revokeObjectURL(blobUrl);
        worker.terminate();

        // Palautetaan nappi normaalitilaan
        pdfNappi.textContent = alkuperainenTeksti;
        pdfNappi.disabled = false;
        pdfNappi.style.backgroundColor = ""; // Palautetaan CSS:n alkuperäinen väri
      }
    };

    // Virheenkäsittely
    worker.onerror = function(err) {
      alert("Virhe PDF:n luonnissa. Tarkista konsoli.");
      console.error("Worker error:", err);
      pdfNappi.textContent = alkuperainenTeksti;
      pdfNappi.disabled = false;
    };
  };
});
    // --- 1. KANSILEHTI ---
    const keraajanNimi = kaikkiHavainnot[0].oppilas || "Tuntematon kerääjä";
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(26);
    doc.text("DIGITAALINEN HERBAARIO", 105, 50, { align: "center" });
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(14);
    doc.text(`Kerääjä: ${keraajanNimi}`, 105, 65, { align: "center" });
    doc.text(`Luotu: ${new Date().toLocaleDateString("fi-FI")}`, 105, 75, { align: "center" });
    doc.text(`Kasveja yhteensä: ${kaikkiHavainnot.length} kpl`, 105, 85, { align: "center" });

    // --- 2. KASVISIVUT (1 kasvi per sivu) ---
    kaikkiHavainnot.forEach((havainto, index) => {
      doc.addPage(); // Uusi sivu jokaista kasvia varten
      let y = 20;

      // Nimitiedot
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(20);
      doc.text(`${index + 1}. ${havainto.laji}`, 14, y);
      
      // Tieteellinen nimi (kursivoituna), jos se on annettu
      if (havainto.tieteellinen) {
        doc.setFont("Helvetica", "italic");
        doc.setFontSize(14);
        doc.text(`(${havainto.tieteellinen})`, 14, y + 8);
        y += 8;
      }

      // Paikka-, aika- ja kerääjätiedot
      y += 12;
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Sijainti (GPS): ${havainto.sijainti}`, 14, y);
      doc.text(`Päivämäärä: ${havainto.pvm}`, 14, y + 6);
      doc.text(`Tallentaja: ${havainto.oppilas}`, 14, y + 12);

      y += 20;

      // KUVAT ASETELTUNA (A4 leveys on 210mm, marginaalit huomioituna tilaa on ~182mm)
      try {
        // 1. Yleiskuva (Isona ylhäällä)
        if (havainto.kuvaYleis) {
          doc.setFontSize(10);
          doc.text("1. Yleiskuva / Kasvuympäristö", 14, y);
          // Parametrit: kuva, formaatti, X, Y, leveys, korkeus
          doc.addImage(havainto.kuvaYleis, "JPEG", 14, y + 3, 182, 100);
          y += 110;
        }

        // 2. ja 3. Runko ja Lehti (Pienempinä vierekkäin alhaalla)
        if (havainto.kuvaRunko && havainto.kuvaLehti) {
          doc.text("2. Runko / Varsi", 14, y);
          doc.text("3. Lehti / Kukka", 110, y);
          
          doc.addImage(havainto.kuvaRunko, "JPEG", 14, y + 3, 86, 80);
          doc.addImage(havainto.kuvaLehti, "JPEG", 110, y + 3, 86, 80);
        }
      } catch (err) {
        console.error("Virhe kuvien viennissä:", err);
        doc.text("[Kuvien renderöinti PDF-tiedostoon epäonnistui]", 14, y + 10);
      }
    });

    // --- 3. PDF:N SUOJAUS JA METADATA ---
    doc.setProperties({
      title: `Digiherbaario - ${keraajanNimi}`,
      subject: "Ammatillinen kasvionäyte - Ei muokattavissa",
      author: keraajanNimi,
      creator: "Digiherbaario PWA"
    });

    // Tallennus
    doc.save(`Herbaario_${keraajanNimi.replace(/\s+/g, '_')}.pdf`);
  };
});
// Rekisteröidään Service Worker offline-tilaa varten
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log("SW virhe", err));
}
