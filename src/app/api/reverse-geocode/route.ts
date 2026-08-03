// 좌표 → 행정구역(시·군·구 + 읍·면·동) 리버스 지오코딩. Kakao 로컬 API 사용.
// KAKAO_REST_API_KEY 가 있으면 "oo시 oo동"까지, 없으면 { configured:false } →
// 클라이언트가 시·군·구 근사(nearestCityLabel)로 폴백한다.

export async function GET(request: Request) {
  const key = process.env.KAKAO_REST_API_KEY;
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) {
    return Response.json({ error: "missing_coords" }, { status: 400 });
  }
  if (!key) return Response.json({ configured: false });

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );
    if (!res.ok) {
      return Response.json(
        { configured: true, error: "upstream_error", status: res.status },
        { status: 502 },
      );
    }
    const data = await res.json();
    const docs: {
      region_type?: string;
      region_1depth_name?: string;
      region_2depth_name?: string;
      region_3depth_name?: string;
    }[] = data?.documents ?? [];
    // 행정동("H") 우선, 없으면 법정동("B") 등 첫 결과
    const doc = docs.find((d) => d.region_type === "H") ?? docs[0];
    if (!doc) return Response.json({ configured: true, label: null });
    const label = [doc.region_2depth_name, doc.region_3depth_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return Response.json({
      configured: true,
      label: label || null,
      region1: doc.region_1depth_name ?? "",
      region2: doc.region_2depth_name ?? "",
      region3: doc.region_3depth_name ?? "",
    });
  } catch {
    return Response.json(
      { configured: true, error: "request_failed" },
      { status: 502 },
    );
  }
}
