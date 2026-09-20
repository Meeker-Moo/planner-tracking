import { TestBed } from '@angular/core/testing';
import { TimeField } from './time-field';

function setup(value: string) {
  const fixture = TestBed.createComponent(TimeField);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  const [hour, minute] = Array.from(fixture.nativeElement.querySelectorAll('select')) as HTMLSelectElement[];
  return { fixture, hour, minute, component: fixture.componentInstance };
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('TimeField', () => {
  it('offers 24 hours and 60 minutes, always in 24-hour form', () => {
    const { hour, minute } = setup('09:30');
    expect(hour.options).toHaveLength(24);
    expect(minute.options).toHaveLength(60);
    expect(hour.options[0].text.trim()).toBe('00');
    expect(hour.options[23].text.trim()).toBe('23');
    expect([...hour.options].some((o) => /am|pm/i.test(o.text))).toBe(false);
  });

  it('shows the given time', () => {
    const { hour, minute } = setup('14:05');
    expect(hour.value).toBe('14');
    expect(minute.value).toBe('05');
  });

  it('changes the hour and the minute independently', () => {
    const { hour, minute, component } = setup('09:30');
    choose(hour, '17');
    expect(component.value()).toBe('17:30');
    choose(minute, '45');
    expect(component.value()).toBe('17:45');
  });

  it('starts from 00:00 when the value is empty or not a time', () => {
    const empty = setup('');
    choose(empty.minute, '15');
    expect(empty.component.value()).toBe('00:15');

    const odd = setup('9:5');
    choose(odd.hour, '08');
    expect(odd.component.value()).toBe('08:00');
  });
});
