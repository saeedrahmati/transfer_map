
    "use strict";

    const $ = id => document.getElementById(id);

    /*
      نام‌های قابل قبول برای ستون‌های شیپ‌فایل و اکسل.

      اگر ستون نام شهرستان در شیپ‌فایل عنوان دیگری دارد،
      نام آن را به county اضافه کنید.
    */
    const aliases = {
      county: [
        "شهرستان",
        "نام شهرستان",
        "Region",
        "county",
        "name",
        "NAME_2"
      ],

      personnel: [
        "کد پرسنلی",
        "شماره پرسنلی",
        "personnel_code",
        "personnel_id"
      ],

      name: [
        "نام و نام خانوادگی",
        "نام و نام‌خانوادگی",
        "نام کامل",
        "full_name"
      ],

      request: [
        "نوع درخواست"
      ],

      origin: [
        "مبدا",
        "مبدأ"
      ],

      job: [
        "رشته شغلی"
      ],

      executive: [
        "پست سازمانی اجرایی (ERP)",
        "پست سازمانی اجرایی"
      ],

      approved: [
        "پست سازمانی مصوب (ERP)",
        "پست سازمانی مصوب"
      ],

      deputy: [
        "معاونت"
      ],

      priority: [
        "اولویت"
      ],

      destination: [
        "مقصد"
      ]
    };

    const labels = {
      county: "نام شهرستان در شیپ‌فایل",
      personnel: "کد پرسنلی",
      name: "نام و نام خانوادگی",
      request: "نوع درخواست",
      origin: "مبدا",
      job: "رشته شغلی",
      executive: "پست سازمانی اجرایی",
      approved: "پست سازمانی مصوب",
      deputy: "معاونت",
      priority: "اولویت",
      destination: "مقصد"
    };

    const requiredFields = [
      "personnel",
      "name",
      "request",
      "origin",
      "job",
      "executive",
      "approved",
      "deputy",
      "priority",
      "destination"
    ];

    const textSearchConfig = [
      {
        field: "personnel",
        input: "searchPersonnel"
      },
      {
        field: "name",
        input: "searchName"
      },
      {
        field: "request",
        input: "searchRequest",
        list: "requestOptions"
      },
      {
        field: "origin",
        input: "searchOrigin",
        list: "originOptions"
      },
      {
        field: "job",
        input: "searchJob",
        list: "jobOptions"
      },
      {
        field: "executive",
        input: "searchExecutive",
        list: "executiveOptions"
      },
      {
        field: "approved",
        input: "searchApproved",
        list: "approvedOptions"
      }
    ];

    let map = null;

    let baseLayers = {};
    let activeBaseLayer = null;
    let baseLayerControl = null;

    let polygonLayer = null;
    let labelLayer = null;
    let regionBounds = null;

    let regions = [];
    let people = [];
    let filteredPeople = [];
    let tableColumns = [];
    let countyNames = new Map();

    let selectedCountyKey = null;
    let loaded = false;
    let filterTimer = null;

    // --------------------------------------------------
    // ابزارهای متن و یکسان‌سازی
    // --------------------------------------------------

    function rawText(value) {
      return value === null || value === undefined
        ? ""
        : String(value).trim();
    }

    function text(value) {
      return rawText(value)
        .replace(/ي/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/\u200c/g, " ")
        .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeDigits(value) {
      return text(value)
        .replace(/[۰-۹]/g, digit =>
          String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
        )
        .replace(/[٠-٩]/g, digit =>
          String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
        );
    }

    function key(value) {
      return normalizeDigits(value).toLowerCase();
    }

    /*
      فقط برای شناسایی عنوان ستون‌ها.
      قواعد تطبیق نام شهرستان جداگانه است.
    */
    function headerKey(value) {
      return key(value)
        .replace(/[أإآ]/g, "ا")
        .replace(/[\s_()（）\-]/g, "");
    }

    /*
      تطبیق نام شهرستان:

      - یکسان‌سازی ی و ک فارسی/عربی
      - یکسان‌سازی ارقام
      - حذف فاصله‌های اضافی
      - بدون حذف فاصله‌های داخل نام
      - بدون حذف پیشوند «شهرستان»
      - بدون حذف توضیحات یا حدس‌زدن نام
    */
    function countyKey(value) {
      return key(value);
    }

    function personnelCode(value) {
      return normalizeDigits(value).replace(/\.0$/, "");
    }

    function priorityKey(value) {
      const normalized = normalizeDigits(value);

      if (/^\d+(?:\.0+)?$/.test(normalized)) {
        return String(Number(normalized));
      }

      return key(normalized);
    }

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function setMessage(message, type = "") {
      $("message").textContent = message;
      $("message").className =
        "message" + (type ? " " + type : "");
    }

    function findColumnIndex(columns, candidates) {
      for (const candidate of candidates) {
        const index = columns.findIndex(
          column =>
            headerKey(column) === headerKey(candidate)
        );

        if (index !== -1) {
          return index;
        }
      }

      return -1;
    }

    // --------------------------------------------------
    // ساخت فهرست‌های جستجو
    // --------------------------------------------------

    function populateDatalist(id, values) {
      const list = $(id);
      list.replaceChildren();

      const unique = new Map();

      for (const value of values) {
        const display = text(value);
        const normalized = key(display);

        if (display && !unique.has(normalized)) {
          unique.set(normalized, display);
        }
      }

      const sorted = [...unique.values()].sort(
        (a, b) =>
          a.localeCompare(b, "fa", { numeric: true })
      );

      const fragment = document.createDocumentFragment();

      for (const value of sorted) {
        const option = document.createElement("option");
        option.value = value;
        fragment.appendChild(option);
      }

      list.appendChild(fragment);
    }

    function populateSelect(
      id,
      values,
      allLabel,
      normalizer
    ) {
      const select = $(id);
      select.replaceChildren(new Option(allLabel, ""));

      const unique = new Map();

      for (const value of values) {
        const display = text(value);
        const normalized = normalizer(value);

        if (
          display &&
          normalized &&
          !unique.has(normalized)
        ) {
          unique.set(normalized, display);
        }
      }

      const sorted = [...unique.entries()].sort(
        (a, b) =>
          a[1].localeCompare(
            b[1],
            "fa",
            { numeric: true }
          )
      );

      for (const [normalized, display] of sorted) {
        select.add(new Option(display, normalized));
      }
    }

    // --------------------------------------------------
    // ساخت جدول با تمام ستون‌های اکسل
    // --------------------------------------------------

    function createTable(
      containerId,
      rows,
      emptyMessage,
      showIssues = false
    ) {
      const container = $(containerId);
      container.replaceChildren();

      if (!rows.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent =
          emptyMessage || "موردی برای نمایش پیدا نشد.";

        container.appendChild(p);
        return;
      }

      const wrap = document.createElement("div");
      wrap.className = "table-wrap";

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headingRow = document.createElement("tr");

      const numberHeading = document.createElement("th");
      numberHeading.textContent = "ردیف نمایش";
      headingRow.appendChild(numberHeading);

      if (showIssues) {
        const excelRowHeading =
          document.createElement("th");

        excelRowHeading.textContent = "ردیف شیت اکسل";
        headingRow.appendChild(excelRowHeading);

        const issueHeading = document.createElement("th");
        issueHeading.textContent = "علت عدم تطبیق";
        headingRow.appendChild(issueHeading);
      }

      for (const column of tableColumns) {
        const th = document.createElement("th");
        th.textContent = column.title;
        headingRow.appendChild(th);
      }

      thead.appendChild(headingRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      const fragment = document.createDocumentFragment();

      rows.forEach((person, index) => {
        const tr = document.createElement("tr");

        const numberCell = document.createElement("td");
        numberCell.className = "row-number";
        numberCell.textContent = String(index + 1);
        tr.appendChild(numberCell);

        if (showIssues) {
          const excelRowCell =
            document.createElement("td");

          excelRowCell.className = "row-number";
          excelRowCell.textContent =
            String(person.excelRowNumber);

          tr.appendChild(excelRowCell);

          const issueCell = document.createElement("td");
          issueCell.className = "issue-cell";
          issueCell.textContent = person.issues.join("\n");

          tr.appendChild(issueCell);
        }

        for (const column of tableColumns) {
          const td = document.createElement("td");

          td.textContent =
            person.cells[column.index] || "—";

          tr.appendChild(td);
        }

        fragment.appendChild(tr);
      });

      tbody.appendChild(fragment);
      table.appendChild(tbody);
      wrap.appendChild(table);
      container.appendChild(wrap);
    }

    // --------------------------------------------------
    // خواندن شیپ‌فایل
    // --------------------------------------------------

    async function readRegions(file) {
      const buffer = await file.arrayBuffer();
      const result = await shp(buffer);

      const collections = Array.isArray(result)
        ? result
        : [result];

      const features = collections.flatMap(collection =>
        collection &&
          collection.type === "FeatureCollection"
          ? collection.features || []
          : []
      );

      const polygons = features.filter(feature =>
        feature &&
        feature.geometry &&
        ["Polygon", "MultiPolygon"].includes(
          feature.geometry.type
        )
      );

      if (!polygons.length) {
        throw new Error(
          "هیچ پلیگون شهرستانی داخل فایل ZIP پیدا نشد."
        );
      }

      const columns = [
        ...new Set(
          polygons.flatMap(feature =>
            Object.keys(feature.properties || {})
          )
        )
      ];

      const columnIndex = findColumnIndex(
        columns,
        aliases.county
      );

      if (columnIndex === -1) {
        throw new Error(
          "ستون نام شهرستان در شیپ‌فایل پیدا نشد.\n" +
          "نام ستون‌های موجود:\n" +
          columns.join("، ") +
          "\nنام ستون صحیح را به aliases.county اضافه کنید."
        );
      }

      const countyColumn = columns[columnIndex];

      const resultRegions = polygons.map(feature => {
        const county = text(
          (feature.properties || {})[countyColumn]
        );

        return {
          feature,
          county,
          countyKey: countyKey(county)
        };
      });

      const emptyNameCount = resultRegions.filter(
        region => !region.countyKey
      ).length;

      if (emptyNameCount) {
        throw new Error(
          `${emptyNameCount} پلیگون در شیپ‌فایل نام شهرستان ندارد. ` +
          "ستون نام شهرستان را تکمیل کنید."
        );
      }

      return resultRegions;
    }

    // --------------------------------------------------
    // خواندن اکسل
    // --------------------------------------------------

    async function readPeople(file) {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array"
      });

      if (!workbook.SheetNames.length) {
        throw new Error("فایل اکسل شیت ندارد.");
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet || !sheet["!ref"]) {
        throw new Error("شیت اول اکسل خالی است.");
      }

      /*
        شروع از ردیف اول شیت برای ثبت شماره ردیف اکسل.
        raw:false مقدار نمایشی سلول را می‌خواند.
      */
      const data = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
        range: 0
      });

      if (!data.length) {
        throw new Error("شیت اول اکسل خالی است.");
      }

      /*
        جستجوی سرستون در ۲۰ ردیف اول.
      */
      let headerRowIndex = -1;
      let bestScore = 0;

      for (
        let i = 0;
        i < Math.min(data.length, 20);
        i++
      ) {
        const candidate = data[i] || [];

        const score = requiredFields.reduce(
          (total, field) =>
            total +
            (
              findColumnIndex(
                candidate,
                aliases[field]
              ) !== -1
                ? 1
                : 0
            ),
          0
        );

        if (score > bestScore) {
          bestScore = score;
          headerRowIndex = i;
        }
      }

      if (headerRowIndex === -1 || bestScore < 2) {
        throw new Error(
          "ردیف سرستون اکسل پیدا نشد. " +
          "عناوین ستون‌ها باید در یکی از ۲۰ ردیف اول شیت اول باشند."
        );
      }

      const headerRow = data[headerRowIndex] || [];

      /*
        ستون‌های دارای داده، حتی بدون عنوان، حفظ می‌شوند.
      */
      let maxColumns = headerRow.length;

      for (const row of data.slice(headerRowIndex + 1)) {
        maxColumns = Math.max(
          maxColumns,
          Array.isArray(row) ? row.length : 0
        );
      }

      const headers = Array.from(
        { length: maxColumns },
        (_, index) => rawText(headerRow[index])
      );

      const columnIndexes = {};
      const missing = [];

      for (const field of requiredFields) {
        const index = findColumnIndex(
          headers,
          aliases[field]
        );

        columnIndexes[field] = index;

        if (index === -1) {
          missing.push(labels[field]);
        }
      }

      if (missing.length) {
        throw new Error(
          "ستون‌های زیر در اکسل پیدا نشدند:\n" +
          missing.join("، ") +
          "\n\nستون‌های موجود:\n" +
          headers.filter(Boolean).join("، ")
        );
      }

      const activeIndexes = new Set();

      headers.forEach((title, index) => {
        if (title) {
          activeIndexes.add(index);
        }
      });

      for (const row of data.slice(headerRowIndex + 1)) {
        if (!Array.isArray(row)) continue;

        row.forEach((value, index) => {
          if (rawText(value)) {
            activeIndexes.add(index);
          }
        });
      }

      const columns = [...activeIndexes]
        .sort((a, b) => a - b)
        .map(index => ({
          index,

          title:
            headers[index] ||
            `ستون بدون عنوان ${XLSX.utils.encode_col(index)}`
        }));

      const rows = [];

      for (
        let rowIndex = headerRowIndex + 1;
        rowIndex < data.length;
        rowIndex++
      ) {
        const row = data[rowIndex];

        if (
          !Array.isArray(row) ||
          !row.some(value => rawText(value) !== "")
        ) {
          continue;
        }

        const person = {
          excelRowNumber: rowIndex + 1,

          cells: Array.from(
            { length: maxColumns },
            (_, index) => rawText(row[index])
          ),

          searchKeys: {},

          originMatched: false,
          destinationMatched: false,

          destinationKeys: new Set(),
          unmatchedDestinations: [],

          issues: []
        };

        for (const field of requiredFields) {
          person[field] =
            rawText(row[columnIndexes[field]]);

          person.searchKeys[field] =
            field === "personnel"
              ? personnelCode(person[field])
              : field === "priority"
                ? priorityKey(person[field])
                : key(person[field]);
        }

        rows.push(person);
      }

      return {
        rows,
        columns,
        sheetName
      };
    }

    // --------------------------------------------------
    // جداسازی مقصد و بررسی تطبیق
    // --------------------------------------------------

    /*
      جداکننده‌ها:
      ، , ; ؛ / خط جدید - _ – —

      فاصله و کلمه «و» جداکننده نیستند.

      «سبزوار - بردسکن» => دو مقصد
      «سبزوار_بردسکن» => دو مقصد
      «تربت حیدریه» => یک مقصد
      «سبزوار بردسکن» => یک عبارت
      «سبزوار و بردسکن» => یک عبارت
    */
    function splitDestinations(value) {
      return rawText(value)
        .split(/[،,;؛\/\r\n_\-–—]+/)
        .map(text)
        .filter(Boolean);
    }

    function analyzeLocations(rows, names) {
      for (const person of rows) {
        person.issues = [];
        person.destinationKeys = new Set();
        person.unmatchedDestinations = [];

        const origin = text(person.origin);

        person.originMatched =
          Boolean(origin) &&
          names.has(countyKey(origin));

        if (!origin) {
          person.issues.push("مبدا خالی است.");
        } else if (!person.originMatched) {
          person.issues.push(
            `مبدا با شیپ‌فایل تطبیق ندارد: «${person.origin}»`
          );
        }

        const destinationParts =
          splitDestinations(person.destination);

        if (!destinationParts.length) {
          person.destinationMatched = false;

          person.issues.push(
            "مقصد خالی است یا نام شهرستان معتبری وارد نشده است."
          );

          continue;
        }

        const seenParts = new Set();

        for (const destination of destinationParts) {
          const destinationKey = countyKey(destination);

          if (seenParts.has(destinationKey)) {
            continue;
          }

          seenParts.add(destinationKey);

          if (names.has(destinationKey)) {
            person.destinationKeys.add(destinationKey);
          } else {
            person.unmatchedDestinations.push(
              destination
            );
          }
        }

        person.destinationMatched =
          person.unmatchedDestinations.length === 0;

        if (!person.destinationMatched) {
          person.issues.push(
            "مقصدهای بدون تطبیق: " +
            person.unmatchedDestinations
              .map(value => `«${value}»`)
              .join("، ")
          );
        }
      }
    }

    function renderCountyNames() {
      const container = $("countyNamesList");
      container.replaceChildren();

      const list = document.createElement("ul");

      const sorted = [...countyNames.values()].sort(
        (a, b) => a.localeCompare(b, "fa")
      );

      for (const name of sorted) {
        const item = document.createElement("li");
        item.textContent = name;
        list.appendChild(item);
      }

      container.appendChild(list);
    }

    function renderUnmatched() {
      const unmatchedRows = filteredPeople.filter(
        person => person.issues.length > 0
      );

      const originMismatchCount = filteredPeople.filter(
        person => !person.originMatched
      ).length;

      const destinationMismatchCount =
        filteredPeople.filter(
          person => !person.destinationMatched
        ).length;

      $("unmatchedCount").textContent =
        `ردیف‌های دارای عدم تطبیق: ${unmatchedRows.length}`;

      $("originMismatchCount").textContent =
        `مبدا نامنطبق: ${originMismatchCount}`;

      $("destinationMismatchCount").textContent =
        `مقصد نامنطبق: ${destinationMismatchCount}`;

      const emptyMessage = filteredPeople.length
        ? "در نتایج فعلی، همه مبداها و مقصدها با نام شهرستان‌های شیپ‌فایل تطبیق دارند."
        : "ردیفی مطابق جستجوهای فعلی وجود ندارد.";

      createTable(
        "unmatchedResults",
        unmatchedRows,
        emptyMessage,
        true
      );
    }

    // --------------------------------------------------
    // نقشه‌های پایه و کنترل داخل نقشه
    // --------------------------------------------------

    function updateBaseMapState(choice) {
      if (!map || !baseLayers[choice]) return;

      activeBaseLayer = baseLayers[choice];

      const limits = {
        ncc: {
          minZoom: 7,
          maxZoom: 10
        },

        osm: {
          minZoom: 7,
          maxZoom: 10
        },

        none: {
          minZoom: 7,
          maxZoom: 10
        }
      };

      const selectedLimits = limits[choice];

      map.setMinZoom(selectedLimits.minZoom);
      map.setMaxZoom(selectedLimits.maxZoom);

      const currentZoom = map.getZoom();

      if (currentZoom < selectedLimits.minZoom) {
        map.setZoom(selectedLimits.minZoom);
      } else if (currentZoom > selectedLimits.maxZoom) {
        map.setZoom(selectedLimits.maxZoom);
      }

      const messages = {
        ncc:
          "نقشه پایه سازمان نقشه‌برداری کشور فعال است؛ حداقل بزرگ‌نمایی ۷.",

        osm:
          "نقشه پایه OpenStreetMap فعال است.",

        none:
          "نقشه پایه خاموش است؛ پلیگون‌های شهرستان‌ها و نتایج تحلیل همچنان نمایش داده می‌شوند."
      };

      $("baseMapStatus").textContent = messages[choice];
    }

    function createBaseLayers() {
      const osm = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">' +
            "OpenStreetMap</a> contributors",

          minZoom: 2,
          maxZoom: 19,
          tileSize: 256
        }
      );

      const nccWMTS = L.tileLayer(
        "https://iransdi.ncc.gov.ir/cgi-bin/nccmap.cgi?" +
        "layer=nccmap&style=&tilematrixset=EPSG:900913" +
        "&Service=WMTS&Request=GetTile&Version=1.0.0" +
        "&Format=image/png" +
        "&TileMatrix=EPSG:900913:{z}" +
        "&TileCol={x}&TileRow={y}",
        {
          attribution:
            "© سازمان نقشه‌برداری کشور | NCC",

          maxZoom: 23,
          tileSize: 256,
          minZoom: 7,
          zoomOffset: 0
        }
      );

      /*
        یک لایه خالی برای خاموش‌کردن نقشه پایه.
        این گزینه پلیگون‌ها را حذف نمی‌کند.
      */
      const noBaseMap = L.layerGroup();

      baseLayers = {
        ncc: nccWMTS,
        osm,
        none: noBaseMap
      };

      for (const name of ["ncc", "osm"]) {
        const layer = baseLayers[name];

        layer.on("tileerror", () => {
          if (activeBaseLayer !== layer) return;

          const displayName =
            name === "ncc" ? "NCC" : "OSM";

          $("baseMapStatus").textContent =
            `برخی تصاویر نقشه پایه ${displayName} دریافت نشدند. ` +
            "ممکن است سرویس در دسترس نباشد یا دریافت از این مرورگر محدود شده باشد. " +
            "از کنترل داخل نقشه، نقشه پایه دیگر را انتخاب کنید. " +
            "این مشکل مانع نمایش پلیگون‌ها و تحلیل اکسل نمی‌شود.";
        });
      }

      /*
        انتخاب‌ها از نوع نقشه پایه هستند:
        با روشن‌کردن یکی، دیگری خاموش می‌شود.
      */
      map.on("baselayerchange", event => {
        if (event.layer === baseLayers.ncc) {
          updateBaseMapState("ncc");
        } else if (event.layer === baseLayers.osm) {
          updateBaseMapState("osm");
        } else if (event.layer === baseLayers.none) {
          updateBaseMapState("none");
        }
      });

      // NCC به‌عنوان نقشه پایه پیش‌فرض
      updateBaseMapState("ncc");
      nccWMTS.addTo(map);

      baseLayerControl = L.control.layers(
        {
          "سازمان نقشه‌برداری کشور — NCC": nccWMTS,
          "OpenStreetMap — OSM": osm,
          "بدون نقشه پایه": noBaseMap
        },
        null,
        {
          position: "topright",
          collapsed: false
        }
      ).addTo(map);
    }

    // --------------------------------------------------
    // رنگ‌بندی نقشه
    // --------------------------------------------------

    function mixColor(a, b, fraction) {
      const channels = [1, 3, 5].map(index => {
        const start = parseInt(
          a.slice(index, index + 2),
          16
        );

        const end = parseInt(
          b.slice(index, index + 2),
          16
        );

        return Math.round(
          start + (end - start) * fraction
        )
          .toString(16)
          .padStart(2, "0");
      });

      return "#" + channels.join("");
    }

    function colorForCount(count, maxCount) {
      if (count === 0) {
        return "#d1d5db";
      }

      const stops = [
        "#fff7bc",
        "#fec44f",
        "#f03b20",
        "#bd0026"
      ];

      const position = maxCount <= 1
        ? 0
        : ((count - 1) / (maxCount - 1)) *
        (stops.length - 1);

      const index = Math.min(
        Math.floor(position),
        stops.length - 2
      );

      return mixColor(
        stops[index],
        stops[index + 1],
        position - index
      );
    }

    // --------------------------------------------------
    // نمایش پلیگون‌ها و برچسب‌ها
    // --------------------------------------------------

    function syncLabels() {
      if (!map || !labelLayer) return;

      if ($("showLabels").checked) {
        if (!map.hasLayer(labelLayer)) {
          labelLayer.addTo(map);
        }
      } else if (map.hasLayer(labelLayer)) {
        map.removeLayer(labelLayer);
      }
    }

    function renderMap() {
      if (!map) return;

      if (polygonLayer) {
        map.removeLayer(polygonLayer);
      }

      if (labelLayer) {
        map.removeLayer(labelLayer);
      }

      polygonLayer = L.layerGroup().addTo(map);
      labelLayer = L.layerGroup();

      const counts = new Map();

      /*
        هر ردیف در هر شهرستان فقط یک بار شمرده می‌شود.
        مقصدهای صحیح ردیف دارای عدم تطبیق نیز شمارش می‌شوند.
      */
      for (const person of filteredPeople) {
        for (const destinationKey of person.destinationKeys) {
          counts.set(
            destinationKey,
            (counts.get(destinationKey) || 0) + 1
          );
        }
      }

      let maxCount = 0;

      for (const region of regions) {
        maxCount = Math.max(
          maxCount,
          counts.get(region.countyKey) || 0
        );
      }

      $("legendMax").textContent =
        `زیاد (${maxCount})`;

      const allPolygons = L.featureGroup();
      const countyBounds = new Map();

      for (const region of regions) {
        const count =
          counts.get(region.countyKey) || 0;

        const isSelected =
          region.countyKey === selectedCountyKey;

        const normalStyle = {
          color: isSelected ? "#111827" : "#475569",
          weight: isSelected ? 4 : 1,
          fillColor: colorForCount(count, maxCount),
          fillOpacity: 0.75
        };

        const layer = L.geoJSON(region.feature, {
          style: normalStyle
        });

        layer.bindTooltip(
          `شهرستان: ${escapeHTML(region.county)}<br>` +
          `تعداد درخواست به این مقصد: ${count}`,
          {
            sticky: true
          }
        );

        layer.on("mouseover", () => {
          layer.setStyle({
            weight: isSelected ? 4 : 3,
            color: "#111827",
            fillOpacity: 0.90
          });
        });

        layer.on("mouseout", () => {
          layer.setStyle(normalStyle);
        });

        layer.on("click", () => {
          /*
            اعمال جستجوی در انتظار پیش از انتخاب شهرستان.
          */
          clearTimeout(filterTimer);

          selectedCountyKey = region.countyKey;
          applyFilters();

          /*
            نتایج در بخش مستقیماً زیر نقشه نمایش داده می‌شوند.
          */
          $("selectedSection").scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        });

        layer.addTo(polygonLayer);
        allPolygons.addLayer(layer);

        const bounds = layer.getBounds();

        if (bounds.isValid()) {
          if (!countyBounds.has(region.countyKey)) {
            countyBounds.set(
              region.countyKey,
              L.latLngBounds(
                bounds.getSouthWest(),
                bounds.getNorthEast()
              )
            );
          } else {
            countyBounds
              .get(region.countyKey)
              .extend(bounds);
          }
        }
      }

      /*
        اگر یک شهرستان چند Feature داشته باشد،
        تنها یک برچسب برای آن ساخته می‌شود.
      */
      for (
        const [destinationKey, bounds]
        of countyBounds
      ) {
        const count =
          counts.get(destinationKey) || 0;

        const county =
          countyNames.get(destinationKey);

        L.marker(bounds.getCenter(), {
          interactive: false,
          keyboard: false,

          icon: L.divIcon({
            className: "county-label-icon",

            html:
              '<div class="county-label-text">' +
              escapeHTML(county) +
              "<br>درخواست: " +
              count +
              "</div>",

            iconSize: [0, 0],
            iconAnchor: [0, 0]
          })
        }).addTo(labelLayer);
      }

      regionBounds = allPolygons.getBounds();

      syncLabels();

      const mappedRows = filteredPeople.filter(
        person => person.destinationKeys.size > 0
      ).length;

      let totalRequests = 0;

      for (const count of counts.values()) {
        totalRequests += count;
      }

      $("mapCaption").textContent =
        `تعداد پلیگون‌ها: ${regions.length} | ` +
        `تعداد شهرستان‌های متمایز: ${countyNames.size} | ` +
        `ردیف‌های دارای حداقل یک مقصد متناظر: ${mappedRows} | ` +
        `مجموع درخواست‌های شهرستانی: ${totalRequests}. ` +
        "خاکستری: بدون درخواست؛ زرد تا قرمز: کمتر تا بیشتر. " +
        "به‌دلیل مقصدهای چندگانه، مجموع درخواست‌ها ممکن است " +
        "از تعداد ردیف‌های اکسل بیشتر باشد.";
    }

    function fitRegions() {
      if (
        map &&
        regionBounds &&
        regionBounds.isValid()
      ) {
        map.invalidateSize();

        map.fitBounds(regionBounds, {
          padding: [20, 20],
          maxZoom: 11
        });
      }
    }

    // --------------------------------------------------
    // نتایج شهرستان انتخاب‌شده
    // --------------------------------------------------

    function renderSelected() {
      const county = selectedCountyKey
        ? countyNames.get(selectedCountyKey)
        : null;

      $("clearSelection").hidden = !county;

      if (!county) {
        $("selectedTitle").textContent =
          "متقاضیان انتقال به شهرستان انتخاب‌شده";

        $("selectedCount").textContent = "";

        $("selectedResults").textContent =
          "برای مشاهده متقاضیان، روی یک شهرستان کلیک کنید.";

        return;
      }

      const matches = filteredPeople.filter(person =>
        person.destinationKeys.has(selectedCountyKey)
      );

      $("selectedTitle").textContent =
        `متقاضیان انتقال به ${county}`;

      $("selectedCount").textContent =
        `تعداد ردیف‌های مطابق جستجوها: ${matches.length}`;

      createTable(
        "selectedResults",
        matches,
        "با جستجوهای فعلی، متقاضی‌ای برای این شهرستان پیدا نشد."
      );
    }

    // --------------------------------------------------
    // اعمال جستجوها
    // --------------------------------------------------

    function clearSearchInputs() {
      for (const config of textSearchConfig) {
        $(config.input).value = "";
      }

      $("filterDeputy").value = "";
      $("filterPriority").value = "";
    }

    function applyFilters() {
      if (!loaded) return;

      const queries = textSearchConfig.map(config => {
        const value = $(config.input).value;

        return {
          field: config.field,

          query:
            config.field === "personnel"
              ? personnelCode(value)
              : key(value)
        };
      });

      const deputy = $("filterDeputy").value;
      const priority = $("filterPriority").value;

      filteredPeople = people.filter(person => {
        const textMatches = queries.every(
          ({ field, query }) =>
            !query ||
            person.searchKeys[field].includes(query)
        );

        const deputyMatches =
          !deputy ||
          person.searchKeys.deputy === deputy;

        const priorityMatches =
          !priority ||
          person.searchKeys.priority === priority;

        return (
          textMatches &&
          deputyMatches &&
          priorityMatches
        );
      });

      $("allCount").textContent =
        `تعداد ردیف‌های مطابق جستجو: ${filteredPeople.length} ` +
        `از ${people.length} ردیف اکسل`;

      createTable(
        "allResults",
        filteredPeople,
        "ردیفی مطابق جستجوهای فعلی پیدا نشد."
      );

      renderMap();
      renderSelected();
      renderUnmatched();
    }

    // --------------------------------------------------
    // بارگذاری فایل‌ها
    // --------------------------------------------------

    async function loadFiles() {
      const shapeFile = $("shapeFile").files[0];
      const excelFile = $("excelFile").files[0];

      if (!shapeFile || !excelFile) {
        setMessage(
          "هر دو فایل ZIP شیپ‌فایل و اکسل را انتخاب کنید.",
          "error"
        );
        return;
      }

      clearTimeout(filterTimer);

      const button = $("loadButton");
      button.disabled = true;

      setMessage("در حال خواندن و پردازش فایل‌ها...");

      try {
        const [newRegions, excelData] =
          await Promise.all([
            readRegions(shapeFile),
            readPeople(excelFile)
          ]);

        const newCountyNames = new Map();

        for (const region of newRegions) {
          if (!newCountyNames.has(region.countyKey)) {
            newCountyNames.set(
              region.countyKey,
              region.county
            );
          }
        }

        analyzeLocations(
          excelData.rows,
          newCountyNames
        );

        /*
          جایگزینی داده‌ها پس از خواندن موفق هر دو فایل.
        */
        regions = newRegions;
        people = excelData.rows;
        tableColumns = excelData.columns;
        countyNames = newCountyNames;

        selectedCountyKey = null;
        loaded = true;

        clearSearchInputs();

        for (const config of textSearchConfig) {
          if (config.list) {
            populateDatalist(
              config.list,
              people.map(
                person => person[config.field]
              )
            );
          }
        }

        populateSelect(
          "filterDeputy",
          people.map(person => person.deputy),
          "همه معاونت‌ها",
          key
        );

        populateSelect(
          "filterPriority",
          people.map(person => person.priority),
          "همه اولویت‌ها",
          priorityKey
        );

        // renderCountyNames();
        applyFilters();
        fitRegions();

        const unmatchedRows = people.filter(
          person => person.issues.length > 0
        ).length;

        const locationMessage = people.length === 0
          ? "شیت اکسل ردیف داده‌ای ندارد."
          : unmatchedRows
            ? `${unmatchedRows} ردیف دارای مبدا یا مقصد بدون تطبیق است. ` +
            "جدول «بررسی عدم تطبیق مبدا و مقصد» در انتهای صفحه را مشاهده کنید."
            : "همه مبداها و مقصدها با شهرستان‌های شیپ‌فایل تطبیق دارند.";

        setMessage(
          `${regions.length} پلیگون و ${people.length} ردیف اکسل بارگذاری شد.\n` +
          `شیت خوانده‌شده: ${excelData.sheetName}\n` +
          locationMessage,
          "success"
        );
      } catch (error) {
        console.error(error);

        setMessage(
          "خطا در خواندن یا نمایش فایل‌ها:\n" +
          (error.message || String(error)),
          "error"
        );
      } finally {
        button.disabled = false;
      }
    }

    // --------------------------------------------------
    // راه‌اندازی برنامه
    // --------------------------------------------------

    function init() {
      if (
        typeof window.L === "undefined" ||
        typeof window.XLSX === "undefined" ||
        typeof window.shp === "undefined"
      ) {
        setMessage(
          "یکی از کتابخانه‌های نقشه، اکسل یا شیپ‌فایل بارگذاری نشده است.\n" +
          "اینترنت و دسترسی به CDN را بررسی کنید و صفحه را دوباره بارگذاری کنید.",
          "error"
        );

        $("loadButton").disabled = true;
        return;
      }

      try {
        map = L.map("map", {
          minZoom: 7,
          maxZoom: 23
        }).setView([35.7, 58.5], 7);

        // راهنمای رنگ‌ها
        const legend = L.control({
          position: "bottomleft"
        });

        legend.onAdd = function () {
          const div = L.DomUtil.create(
            "div",
            "legend"
          );

          div.innerHTML = `
            <strong>تعداد درخواست به مقصد</strong>

            <div style="margin-top:7px">
              <span class="legend-zero"></span>
              بدون درخواست
            </div>

            <div class="legend-bar"></div>

            <div style="
              display:flex;
              justify-content:space-between;
              direction:ltr
            ">
              <span>کم</span>
              <span id="legendMax">زیاد (۰)</span>
            </div>
          `;

          L.DomEvent.disableClickPropagation(div);
          L.DomEvent.disableScrollPropagation(div);

          return div;
        };

        legend.addTo(map);

        // ساخت نقشه‌های پایه و کنترل روی نقشه
        createBaseLayers();

        $("loadButton").addEventListener(
          "click",
          loadFiles
        );

        // جستجوهای متنی
        for (const config of textSearchConfig) {
          $(config.input).addEventListener(
            "input",
            () => {
              clearTimeout(filterTimer);

              filterTimer = setTimeout(
                applyFilters,
                180
              );
            }
          );
        }

        // فیلترهای کشویی معاونت و اولویت
        for (const id of [
          "filterDeputy",
          "filterPriority"
        ]) {
          $(id).addEventListener("change", () => {
            clearTimeout(filterTimer);
            applyFilters();
          });
        }

        // پاک‌کردن جستجوها
        $("resetFilters").addEventListener(
          "click",
          () => {
            clearTimeout(filterTimer);
            clearSearchInputs();
            applyFilters();
          }
        );

        // روشن و خاموش‌کردن برچسب شهرستان‌ها
        $("showLabels").addEventListener(
          "change",
          syncLabels
        );

        // نمایش محدوده شهرستان‌ها
        $("zoomRegions").addEventListener(
          "click",
          fitRegions
        );

        // لغو انتخاب شهرستان
        $("clearSelection").addEventListener(
          "click",
          () => {
            clearTimeout(filterTimer);
            selectedCountyKey = null;

            if (loaded) {
              applyFilters();
            }
          }
        );
      } catch (error) {
        console.error(error);

        setMessage(
          "خطا در راه‌اندازی صفحه:\n" +
          (error.message || String(error)),
          "error"
        );

        $("loadButton").disabled = true;
      }
    }

    init();