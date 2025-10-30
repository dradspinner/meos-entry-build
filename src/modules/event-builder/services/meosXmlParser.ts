// MeOS XML Parser Service
// Handles parsing and generation of MeOS XML files

export interface MeOSEventData {
  name: string;
  date: string;
  nameId?: string;
  updated?: string;
  organizer: string;
  courseSetter: string; // CareOf
  homepage?: string;
  cardFee?: number;
  youthAge?: number;
  lateEntryFactor?: string;
  maxTime?: number;
  importStamp?: string;
  currencyFactor?: number;
  currencySymbol?: string;
  currencySeparator?: string;
  currencyPreSymbol?: number;
  features?: string;
  longTimes?: number;
  payModes?: string;
  transferFlags?: number;
  mergeTag?: string;
  extraFields?: string;
  controlMap?: string;
}

export interface MeOSControl {
  id: number;
  numbers: string;
  xpos?: number;
  ypos?: number;
  latitude?: number;
  longitude?: number;
}

export interface MeOSCourse {
  id: number;
  name: string;
  length: number;
  controls: number[];
  legs?: number[];
  startName?: string;
  climb?: number;
}

export interface MeOSClass {
  id: number;
  name: string;
  courseId: number;
  fee?: number;
  allowQuickEntry?: boolean;
  classType?: string;
  startName?: string;
  sortIndex?: number;
}

export interface MeOSClub {
  id: number;
  name: string;
  shortName?: string;
  nationality?: string;
  country?: string;
  district?: string;
  type?: string;
  extId?: string;
}

export interface MeOSCompetitor {
  id: number;
  name: string;
  given?: string;
  family?: string;
  birthYear?: number;
  sex?: 'M' | 'F';
  club?: string;
  clubId?: number;
  nationality?: string;
  cardNumber?: number;
  classId?: number;
  status?: string;
}

export interface MeOSData {
  event: MeOSEventData;
  controls: MeOSControl[];
  courses: MeOSCourse[];
  classes: MeOSClass[];
  clubs: MeOSClub[];
  competitors: MeOSCompetitor[];
}

export class MeOSXMLParser {
  /**
   * Parse MeOS XML file content
   */
  static parseMeOSXML(xmlContent: string): MeOSData {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error(`XML parse error: ${parseError.textContent}`);
    }

    const root = xmlDoc.documentElement;
    if (root.tagName !== 'meosdata') {
      throw new Error('Invalid MeOS XML file: root element must be <meosdata>');
    }

    return {
      event: this.parseEventData(root),
      controls: this.parseControls(root),
      courses: this.parseCourses(root),
      classes: this.parseClasses(root),
      clubs: this.parseClubs(root),
      competitors: this.parseCompetitors(root)
    };
  }

  /**
   * Parse event data from MeOS XML
   */
  private static parseEventData(root: Element): MeOSEventData {
    const getElementText = (tagName: string): string => {
      const element = root.querySelector(tagName);
      return element?.textContent?.trim() || '';
    };

    const oDataElement = root.querySelector('oData');
    const getODataText = (tagName: string): string => {
      const element = oDataElement?.querySelector(tagName);
      return element?.textContent?.trim() || '';
    };

    const getODataNumber = (tagName: string): number | undefined => {
      const text = getODataText(tagName);
      return text ? parseInt(text, 10) : undefined;
    };

    return {
      name: getElementText('Name'),
      date: getElementText('Date'),
      nameId: getElementText('NameId'),
      updated: getElementText('Updated'),
      organizer: getODataText('Organizer'),
      courseSetter: getODataText('CareOf'),
      homepage: getODataText('Homepage'),
      cardFee: getODataNumber('CardFee'),
      youthAge: getODataNumber('YouthAge'),
      lateEntryFactor: getODataText('LateEntryFactor'),
      maxTime: getODataNumber('MaxTime'),
      importStamp: getODataText('ImportStamp'),
      currencyFactor: getODataNumber('CurrencyFactor'),
      currencySymbol: getODataText('CurrencySymbol'),
      currencySeparator: getODataText('CurrencySeparator'),
      currencyPreSymbol: getODataNumber('CurrencyPreSymbol'),
      features: getODataText('Features'),
      longTimes: getODataNumber('LongTimes'),
      payModes: getODataText('PayModes'),
      transferFlags: getODataNumber('TransferFlags'),
      mergeTag: getODataText('MergeTag'),
      extraFields: getODataText('ExtraFields'),
      controlMap: getODataText('ControlMap')
    };
  }

  /**
   * Parse controls from MeOS XML
   */
  private static parseControls(root: Element): MeOSControl[] {
    const controlList = root.querySelector('ControlList');
    if (!controlList) return [];

    const controls = controlList.querySelectorAll('Control');
    return Array.from(controls).map(control => {
      const id = parseInt(control.querySelector('Id')?.textContent || '0', 10);
      const numbers = control.querySelector('Numbers')?.textContent || '';
      const oData = control.querySelector('oData');
      
      const getODataNumber = (tagName: string): number | undefined => {
        const element = oData?.querySelector(tagName);
        const text = element?.textContent?.trim();
        return text ? parseInt(text, 10) : undefined;
      };

      return {
        id,
        numbers,
        xpos: getODataNumber('xpos'),
        ypos: getODataNumber('ypos'),
        latitude: getODataNumber('latcrd'),
        longitude: getODataNumber('longcrd')
      };
    });
  }

  /**
   * Parse courses from MeOS XML
   */
  private static parseCourses(root: Element): MeOSCourse[] {
    const courseList = root.querySelector('CourseList');
    if (!courseList) return [];

    const courses = courseList.querySelectorAll('Course');
    return Array.from(courses).map(course => {
      const id = parseInt(course.querySelector('Id')?.textContent || '0', 10);
      const name = course.querySelector('Name')?.textContent || '';
      const length = parseInt(course.querySelector('Length')?.textContent || '0', 10);
      const controlsText = course.querySelector('Controls')?.textContent || '';
      const legsText = course.querySelector('Legs')?.textContent || '';
      const oData = course.querySelector('oData');
      
      // Parse controls (semicolon-separated)
      const controls = controlsText
        .split(';')
        .filter(c => c.trim())
        .map(c => parseInt(c.trim(), 10))
        .filter(c => !isNaN(c));

      // Parse legs (semicolon-separated)
      const legs = legsText
        .split(';')
        .filter(l => l.trim())
        .map(l => parseInt(l.trim(), 10))
        .filter(l => !isNaN(l));

      const startName = oData?.querySelector('StartName')?.textContent || undefined;
      const climbText = oData?.querySelector('Climb')?.textContent;
      const climb = climbText ? parseInt(climbText, 10) : undefined;

      return {
        id,
        name,
        length,
        controls,
        legs: legs.length > 0 ? legs : undefined,
        startName,
        climb
      };
    });
  }

  /**
   * Parse classes from MeOS XML
   */
  private static parseClasses(root: Element): MeOSClass[] {
    const classList = root.querySelector('ClassList');
    if (!classList) return [];

    const classes = classList.querySelectorAll('Class');
    return Array.from(classes).map(classEl => {
      const id = parseInt(classEl.querySelector('Id')?.textContent || '0', 10);
      const name = classEl.querySelector('Name')?.textContent || '';
      const courseId = parseInt(classEl.querySelector('Course')?.textContent || '0', 10);
      const oData = classEl.querySelector('oData');
      
      const feeText = oData?.querySelector('Fee')?.textContent;
      const fee = feeText ? parseInt(feeText, 10) : undefined;
      const allowQuickEntry = oData?.querySelector('AllowQuickEntry')?.textContent === '1';
      const classType = oData?.querySelector('ClassType')?.textContent || undefined;
      const startName = oData?.querySelector('StartName')?.textContent || undefined;
      const sortIndexText = oData?.querySelector('SortIndex')?.textContent;
      const sortIndex = sortIndexText ? parseInt(sortIndexText, 10) : undefined;

      return {
        id,
        name,
        courseId,
        fee,
        allowQuickEntry,
        classType,
        startName,
        sortIndex
      };
    });
  }

  /**
   * Parse clubs from MeOS XML
   */
  private static parseClubs(root: Element): MeOSClub[] {
    const clubList = root.querySelector('ClubList');
    if (!clubList) return [];

    const clubs = clubList.querySelectorAll('Club');
    return Array.from(clubs).map(club => {
      const id = parseInt(club.querySelector('Id')?.textContent || '0', 10);
      const name = club.querySelector('Name')?.textContent || '';
      const oData = club.querySelector('oData');
      
      return {
        id,
        name,
        shortName: oData?.querySelector('ShortName')?.textContent || undefined,
        nationality: oData?.querySelector('Nationality')?.textContent || undefined,
        country: oData?.querySelector('Country')?.textContent || undefined,
        district: oData?.querySelector('District')?.textContent || undefined,
        type: oData?.querySelector('Type')?.textContent || undefined,
        extId: oData?.querySelector('ExtId')?.textContent || undefined
      };
    });
  }

  /**
   * Parse competitors from MeOS XML
   */
  private static parseCompetitors(root: Element): MeOSCompetitor[] {
    const competitorList = root.querySelector('CompetitorList');
    if (!competitorList) return [];

    const competitors = competitorList.querySelectorAll('Competitor');
    return Array.from(competitors).map(competitor => {
      const id = parseInt(competitor.querySelector('Id')?.textContent || '0', 10);
      const name = competitor.querySelector('Name')?.textContent || '';
      const oData = competitor.querySelector('oData');
      
      const given = oData?.querySelector('Given')?.textContent || undefined;
      const family = oData?.querySelector('Family')?.textContent || undefined;
      const birthYearText = oData?.querySelector('BirthYear')?.textContent;
      const birthYear = birthYearText ? parseInt(birthYearText, 10) : undefined;
      const sexText = oData?.querySelector('Sex')?.textContent;
      const sex = (sexText === 'M' || sexText === 'F') ? sexText : undefined;
      const club = oData?.querySelector('Club')?.textContent || undefined;
      const clubIdText = oData?.querySelector('ClubId')?.textContent;
      const clubId = clubIdText ? parseInt(clubIdText, 10) : undefined;
      const nationality = oData?.querySelector('Nationality')?.textContent || undefined;
      const cardText = oData?.querySelector('CardNo')?.textContent;
      const cardNumber = cardText ? parseInt(cardText, 10) : undefined;
      const classIdText = competitor.querySelector('Class')?.textContent;
      const classId = classIdText ? parseInt(classIdText, 10) : undefined;
      const status = competitor.querySelector('Status')?.textContent || undefined;

      return {
        id,
        name,
        given,
        family,
        birthYear,
        sex,
        club,
        clubId,
        nationality,
        cardNumber,
        classId,
        status
      };
    });
  }

  /**
   * Generate MeOS XML from parsed data
   */
  static generateMeOSXML(data: MeOSData): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n\n';
    xml += '<meosdata version="4.1">\n';
    
    // Event data
    xml += `<Name>${this.escapeXML(data.event.name)}</Name>\n`;
    xml += `<Date>${data.event.date}</Date>\n`;
    xml += `<NameId>${data.event.nameId || `meos_${timestamp}`}</NameId>\n`;
    xml += `<Updated>${timestamp}</Updated>\n`;
    
    // Event oData
    xml += '<oData>\n';
    if (data.event.cardFee !== undefined) xml += `<CardFee>${data.event.cardFee}</CardFee>\n`;
    if (data.event.youthAge !== undefined) xml += `<YouthAge>${data.event.youthAge}</YouthAge>\n`;
    if (data.event.lateEntryFactor) xml += `<LateEntryFactor>${this.escapeXML(data.event.lateEntryFactor)}</LateEntryFactor>\n`;
    if (data.event.maxTime !== undefined) xml += `<MaxTime>${data.event.maxTime}</MaxTime>\n`;
    if (data.event.importStamp) xml += `<ImportStamp>${this.escapeXML(data.event.importStamp)}</ImportStamp>\n`;
    xml += `<Organizer>${this.escapeXML(data.event.organizer)}</Organizer>\n`;
    xml += `<CareOf>${this.escapeXML(data.event.courseSetter)}</CareOf>\n`;
    if (data.event.homepage) xml += `<Homepage>${this.escapeXML(data.event.homepage)}</Homepage>\n`;
    if (data.event.currencyFactor !== undefined) xml += `<CurrencyFactor>${data.event.currencyFactor}</CurrencyFactor>\n`;
    if (data.event.currencySymbol) xml += `<CurrencySymbol>${this.escapeXML(data.event.currencySymbol)}</CurrencySymbol>\n`;
    if (data.event.currencySeparator) xml += `<CurrencySeparator>${this.escapeXML(data.event.currencySeparator)}</CurrencySeparator>\n`;
    if (data.event.currencyPreSymbol !== undefined) xml += `<CurrencyPreSymbol>${data.event.currencyPreSymbol}</CurrencyPreSymbol>\n`;
    if (data.event.features) xml += `<Features>${this.escapeXML(data.event.features)}</Features>\n`;
    if (data.event.longTimes !== undefined) xml += `<LongTimes>${data.event.longTimes}</LongTimes>\n`;
    if (data.event.payModes) xml += `<PayModes>${this.escapeXML(data.event.payModes)}</PayModes>\n`;
    if (data.event.transferFlags !== undefined) xml += `<TransferFlags>${data.event.transferFlags}</TransferFlags>\n`;
    if (data.event.mergeTag) xml += `<MergeTag>${this.escapeXML(data.event.mergeTag)}</MergeTag>\n`;
    if (data.event.extraFields) xml += `<ExtraFields>${this.escapeXML(data.event.extraFields)}</ExtraFields>\n`;
    if (data.event.controlMap) xml += `<ControlMap>${this.escapeXML(data.event.controlMap)}</ControlMap>\n`;
    xml += '</oData>\n';
    
    // Controls
    if (data.controls.length > 0) {
      xml += '<ControlList>\n';
      data.controls.forEach(control => {
        xml += '<Control>\n';
        xml += `<Id>${control.id}</Id>\n`;
        xml += `<Updated>${timestamp}</Updated>\n`;
        xml += `<Numbers>${control.numbers}</Numbers>\n`;
        xml += '<oData>\n';
        if (control.xpos !== undefined) xml += `<xpos>${control.xpos}</xpos>\n`;
        if (control.ypos !== undefined) xml += `<ypos>${control.ypos}</ypos>\n`;
        if (control.latitude !== undefined) xml += `<latcrd>${control.latitude}</latcrd>\n`;
        if (control.longitude !== undefined) xml += `<longcrd>${control.longitude}</longcrd>\n`;
        xml += '</oData>\n';
        xml += '</Control>\n';
      });
      xml += '</ControlList>\n';
    }
    
    // Courses
    if (data.courses.length > 0) {
      xml += '<CourseList>\n';
      data.courses.forEach(course => {
        xml += '<Course>\n';
        xml += `<Id>${course.id}</Id>\n`;
        xml += `<Updated>${timestamp}</Updated>\n`;
        xml += `<Name>${this.escapeXML(course.name)}</Name>\n`;
        xml += `<Length>${course.length}</Length>\n`;
        xml += `<Controls>${course.controls.join(';')};</Controls>\n`;
        if (course.legs && course.legs.length > 0) {
          xml += `<Legs>${course.legs.join(';')}</Legs>\n`;
        }
        xml += '<oData>\n';
        xml += `<StartName>${course.startName || 'Start'}</StartName>\n`;
        if (course.climb !== undefined) xml += `<Climb>${course.climb}</Climb>\n`;
        xml += '</oData>\n';
        xml += '</Course>\n';
      });
      xml += '</CourseList>\n';
    }
    
    // Classes
    if (data.classes.length > 0) {
      xml += '<ClassList>\n';
      data.classes.forEach(cls => {
        xml += '<Class>\n';
        xml += `<Id>${cls.id}</Id>\n`;
        xml += `<Updated>${timestamp}</Updated>\n`;
        xml += `<Name>${this.escapeXML(cls.name)}</Name>\n`;
        if (cls.courseId) xml += `<Course>${cls.courseId}</Course>\n`;
        xml += '<oData>\n';
        if (cls.fee !== undefined) xml += `<Fee>${cls.fee}</Fee>\n`;
        if (cls.allowQuickEntry) xml += '<AllowQuickEntry>1</AllowQuickEntry>\n';
        if (cls.classType) xml += `<ClassType>${this.escapeXML(cls.classType)}</ClassType>\n`;
        if (cls.startName) xml += `<StartName>${cls.startName}</StartName>\n`;
        if (cls.sortIndex !== undefined) xml += `<SortIndex>${cls.sortIndex}</SortIndex>\n`;
        xml += '</oData>\n';
        xml += '</Class>\n';
      });
      xml += '</ClassList>\n';
    }
    
    // Clubs
    if (data.clubs.length > 0) {
      xml += '<ClubList>\n';
      data.clubs.forEach(club => {
        xml += '<Club>\n';
        xml += `<Id>${club.id}</Id>\n`;
        xml += `<Updated>${timestamp}</Updated>\n`;
        xml += `<Name>${this.escapeXML(club.name)}</Name>\n`;
        xml += '<oData>\n';
        if (club.shortName) xml += `<ShortName>${this.escapeXML(club.shortName)}</ShortName>\n`;
        if (club.nationality) xml += `<Nationality>${this.escapeXML(club.nationality)}</Nationality>\n`;
        if (club.country) xml += `<Country>${this.escapeXML(club.country)}</Country>\n`;
        if (club.district) xml += `<District>${this.escapeXML(club.district)}</District>\n`;
        if (club.type) xml += `<Type>${this.escapeXML(club.type)}</Type>\n`;
        if (club.extId) xml += `<ExtId>${this.escapeXML(club.extId)}</ExtId>\n`;
        xml += '</oData>\n';
        xml += '</Club>\n';
      });
      xml += '</ClubList>\n';
    }
    
    // RunnerList (was CompetitorList)
    xml += '<RunnerList>\n';
    xml += '</RunnerList>\n';
    
    // TeamList
    xml += '<TeamList>\n';
    xml += '</TeamList>\n';
    
    xml += '</meosdata>';
    return xml;
  }

  /**
   * Escape special XML characters
   */
  private static escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get course statistics
   */
  static getCourseStats(data: MeOSData): { [courseName: string]: any } {
    const stats: { [courseName: string]: any } = {};
    
    data.courses.forEach(course => {
      const classesForCourse = data.classes.filter(c => c.courseId === course.id);
      stats[course.name] = {
        length: course.length,
        climb: course.climb || 0,
        controls: course.controls.length,
        classes: classesForCourse.map(c => c.name),
        classCount: classesForCourse.length
      };
    });
    
    return stats;
  }
}