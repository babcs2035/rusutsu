function rubySegments(formData: FormData, textKey: string, readingKey: string) {
  const readings = formData.getAll(readingKey);
  return formData.getAll(textKey).map((text, index) => ({
    text,
    ...(readings[index] ? { ruby: readings[index] } : {}),
  }));
}

/** 行順を保ち、旧称ごとのふりがなを対応する名前にまとめる。検証は契約スキーマで行う。 */
export function resortReadingFieldsFromFormData(formData: FormData) {
  return {
    nameRuby: rubySegments(formData, "rubyText", "rubyReading"),
    formerNames: formData.getAll("formerName").map((name, index) => ({
      name,
      nameRuby: rubySegments(
        formData,
        `formerRubyText:${index}`,
        `formerRubyReading:${index}`,
      ),
    })),
    readingNeedsReview: formData.get("readingNeedsReview") === "on",
  };
}
