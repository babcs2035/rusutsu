export type SkiAreaT = {
  id: string;
  name: {
    ja: string;
    en: string;
  };
  location: {
    prefecture: string;
    town: string;
    latitude: number;
    longitude: number;
  };
  courses: {
    image: string;
    topElevation: number;
    vertical: number;
    baseElevation: number;
    numberOfCourses: number;
    longestCourse: number;
    steepestSlope: number;
    beginnersCoursesPercent: number;
    intermediateCoursesPercent: number;
    advancedCoursesPercent: number;
  };
  lifts: {
    numberOfLifts: number;
    ropeways: number;
    gondolas: number;
    quadLifts: number;
    tripleLifts: number;
    pairLifts: number;
    singleLifts: number;
    otherLifts: number;
  };
  tickets: SkiAreaTicketT[];
  times: {
    weekday: {
      open: string;
      close: string;
    };
    weekend: {
      open: string;
      close: string;
    };
    comment: string;
  };
  others: {
    website: string;
    skiersPercent: number;
    snowboardersPercent: number;
  };
  source: string;
};

export type SkiAreaTicketT = {
  name: string;
  prices: {
    adult: number;
    child: number;
    olderChild: number;
    senior: number;
  };
};

export type SkiResortT = {
  id: string;
  name: {
    ja: string;
    en: string;
  };
  location: {
    prefecture: string;
    town: string;
    latitude: number;
    longitude: number;
  };
  outline: {
    description: {
      short: string;
      long: string;
    };
    images: string[];
    condition: string;
    status: string;
    review: number;
  };
  courses: {
    images: string[];
    topElevation: number;
    vertical: number;
    baseElevation: number;
    numberOfCourses: number;
    longestCourse: number;
    steepestSlope: number;
    beginnersCoursesPercent: number;
    intermediateCoursesPercent: number;
    advancedCoursesPercent: number;
    type: {
      notPressed: number;
      pressed: number;
      bump: number;
    };
    angle: {
      max: number;
      avg: number;
    };
    details: [
      {
        name: string;
        snowboard: string;
        difficulty: string;
        distance: number;
        angle: number;
        note: string;
      },
    ];
  };
  lifts: {
    numberOfLifts: number;
    ropeways: number;
    gondolas: number;
    quadLifts: number;
    tripleLifts: number;
    pairLifts: number;
    singleLifts: number;
    otherLifts: number;
    capacity: number;
    details: [
      {
        name: string;
        type: string;
        distance: number;
        hood: string;
      },
    ];
  };
  tickets: SkiAreaTicketT[];
  times: {
    weekday: {
      open: string;
      close: string;
    };
    weekend: {
      open: string;
      close: string;
    };
    comment: string;
  };
  yukiMagi: {
    available: boolean;
    info: string | null;
    notes: string | null;
  };
  others: {
    website: string;
    skiersPercent: number;
    snowboardersPercent: number;
    sources: string[];
  };
};
