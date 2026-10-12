// Preserve the app's existing calculator projection, including absent values.
export function fieldCalculationInputs(project){
 return {
  polygon:project?.geometry,
  terrain:project?.terrain,
  exclusions:project?.exclusions??[],
  rowSpacingM:project?.rowSpacingM,
  plantSpacingM:project?.plantSpacingM,
  orientationDeg:project?.orientationDeg,
  rowCurvePoints:project?.rowCurvePoints,
  rowPortions:project?.rowPortions,
  maintainRowEquidistance:project?.maintainRowEquidistance!==false,
  postSpacingM:project?.postSpacingM,
  headlandWidthM:project?.headlandWidthM
 };
}
