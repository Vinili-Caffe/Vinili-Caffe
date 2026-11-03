const ANTINUKE_MAX_HEAT = 100;

function percentToHeat(percent?) {
  return (Number(percent) / 100) * ANTINUKE_MAX_HEAT;
}

export = {
  percentToHeat,
};
