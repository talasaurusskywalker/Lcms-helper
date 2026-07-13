export default async (request) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=3600"
  };

  try {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim();

    if (!name || name.length > 250) {
      return new Response(JSON.stringify({ error: "Enter a valid compound name." }), {
        status: 400,
        headers
      });
    }

    const propertyUrl =
      "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/" +
      encodeURIComponent(name) +
      "/property/Title,MolecularFormula,MolecularWeight,XLogP,HydrogenBondDonorCount,HydrogenBondAcceptorCount,Charge/JSON";

    const response = await fetch(propertyUrl, {
      headers: { "user-agent": "LCMS-Stock-Helper/1.0" }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: response.status === 404
          ? "PubChem could not find that compound. Try the generic chemical name without purity, supplier, or catalog number."
          : "PubChem returned an error."
      }), {
        status: response.status === 404 ? 404 : 502,
        headers
      });
    }

    const json = await response.json();
    const p = json?.PropertyTable?.Properties?.[0];

    if (!p) {
      return new Response(JSON.stringify({
        error: "No PubChem property record was returned."
      }), {
        status: 404,
        headers
      });
    }

    const xlogp = Number(p.XLogP);
    const hbd = Number(p.HydrogenBondDonorCount || 0);
    const hba = Number(p.HydrogenBondAcceptorCount || 0);
    const charge = Number(p.Charge || 0);

    let solvent;
    let category;
    let start;
    let notes;

    if (Number.isFinite(xlogp) && xlogp >= 2) {
      solvent = "Methanol";
      category = "methanol";
      start = xlogp >= 4
        ? "Start at 0.05 to 0.2 mg/mL"
        : "Start at 0.1 to 0.5 mg/mL";
      notes =
        "PubChem properties indicate a relatively lipophilic compound. Methanol is the better starting choice of water or methanol. Confirm against the supplier datasheet.";
    } else if (
      (Number.isFinite(xlogp) && xlogp <= 0.5 && hbd + hba >= 3) ||
      charge !== 0
    ) {
      solvent = "Water";
      category = "water";
      start = "Start at 0.5 to 1 mg/mL";
      notes =
        "PubChem properties indicate a polar or charged compound. Water is the better starting choice. Some compounds still require controlled pH adjustment.";
    } else if (
      Number.isFinite(xlogp) &&
      xlogp > 0.5 &&
      xlogp < 2
    ) {
      solvent = "Methanol";
      category = "methanol";
      start = "Start at 0.1 to 0.5 mg/mL";
      notes =
        "The compound has intermediate lipophilicity. Methanol is the safer initial choice, but water may work depending on ionization and pH.";
    } else {
      solvent = "Test water and methanol on a small amount";
      category = "caution";
      start = "Start at 0.1 mg/mL";
      notes =
        "PubChem did not provide enough polarity data for a confident choice. Test a small amount and check the supplier datasheet.";
    }

    return new Response(JSON.stringify({
      name: p.Title || name,
      aliases: [],
      formula: p.MolecularFormula || "Not available",
      mw: Number(p.MolecularWeight),
      solvent,
      category,
      start,
      notes,
      source: "PubChem",
      pubchemCid: p.CID || null
    }), {
      status: 200,
      headers
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: "The server could not complete the PubChem lookup."
    }), {
      status: 500,
      headers
    });
  }
};
